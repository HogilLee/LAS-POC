import os, uuid, json, shutil
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import create_engine, text
import laspy
import numpy as np

DB=os.getenv('DATABASE_URL','postgresql+psycopg://poc:poc@localhost:5432/poc')
ROOT=Path(os.getenv('UPLOAD_DIR','./uploads')); ROOT.mkdir(parents=True,exist_ok=True)
engine=create_engine(DB,pool_pre_ping=True)
app=FastAPI(title='LiDAR GIS PoC API')
app.add_middleware(CORSMiddleware,allow_origins=os.getenv('CORS_ORIGINS','http://localhost:5173').split(','),allow_methods=['*'],allow_headers=['*'])
class Feature(BaseModel):
    name:str=Field(min_length=1,max_length=100)
    geometry:dict

def validate_geometry(g):
    if g.get('type') not in ('Point','LineString','Polygon') or not isinstance(g.get('coordinates'),list):
        raise HTTPException(422,'GeoJSON Point/LineString/Polygon required')
    return json.dumps(g)

def inspect_las(path):
    with laspy.open(path) as reader:
        header=reader.header
        crs=header.parse_crs()
        return {
            'point_count':int(header.point_count),
            'point_format':int(header.point_format.id),
            'version':str(header.version),
            'bounds':{'min':[float(v) for v in header.mins],'max':[float(v) for v in header.maxs]},
            'scales':[float(v) for v in header.scales],
            'offsets':[float(v) for v in header.offsets],
            'crs':crs.to_string() if crs else None,
        }

@app.on_event('startup')
def init():
    with engine.begin() as c:
        c.execute(text('CREATE EXTENSION IF NOT EXISTS postgis'))
        c.execute(text('CREATE TABLE IF NOT EXISTS features (id UUID PRIMARY KEY, name TEXT NOT NULL, geom geometry(Geometry,4326) NOT NULL, updated_at timestamptz DEFAULT now())'))
        c.execute(text('CREATE TABLE IF NOT EXISTS datasets (id UUID PRIMARY KEY, filename TEXT NOT NULL, bytes BIGINT NOT NULL, status TEXT NOT NULL, metadata JSONB, error TEXT, created_at timestamptz DEFAULT now())'))

@app.get('/api/health')
def health(): return {'status':'ok'}
@app.get('/api/features')
def features():
    with engine.connect() as c:
        rows=c.execute(text('SELECT id::text,name,ST_AsGeoJSON(geom) AS geometry FROM features ORDER BY name')).mappings()
        return [{'id':r['id'],'name':r['name'],'geometry':json.loads(r['geometry'])} for r in rows]
@app.post('/api/features',status_code=201)
def add_feature(f:Feature):
    fid=str(uuid.uuid4()); geom=validate_geometry(f.geometry)
    with engine.begin() as c:
        c.execute(text('INSERT INTO features(id,name,geom) VALUES (CAST(:id AS uuid),:name,ST_SetSRID(ST_GeomFromGeoJSON(:geom),4326))'),dict(id=fid,name=f.name,geom=geom))
    return {'id':fid}
@app.put('/api/features/{fid}')
def update_feature(fid:uuid.UUID,f:Feature):
    geom=validate_geometry(f.geometry)
    with engine.begin() as c:
        result=c.execute(text('UPDATE features SET name=:name,geom=ST_SetSRID(ST_GeomFromGeoJSON(:geom),4326),updated_at=now() WHERE id=:id'),dict(id=fid,name=f.name,geom=geom))
        if not result.rowcount: raise HTTPException(404,'Feature not found')
    return {'id':str(fid),'updated':True}
@app.post('/api/las/upload',status_code=201)
def upload(file:UploadFile=File(...)):
    filename=Path(file.filename or '').name
    ext=Path(filename).suffix.lower()
    if ext not in ('.las','.laz'): raise HTTPException(400,'Only LAS/LAZ accepted')
    fid=str(uuid.uuid4()); target=ROOT/(fid+ext); total=0; max_bytes=int(os.getenv('MAX_UPLOAD_BYTES',str(1024**3)))
    try:
        with target.open('wb') as out:
            while chunk:=file.file.read(1024*1024):
                total+=len(chunk)
                if total>max_bytes: raise HTTPException(413,'File too large')
                out.write(chunk)
        with target.open('rb') as stream:
            if stream.read(4)!=b'LASF': raise HTTPException(400,'Invalid LAS signature')
        try:
            meta=inspect_las(target)
            status='inspected'; error=None
        except Exception as e:
            meta=None; status='inspection_failed'; error=str(e)[:500]
        with engine.begin() as c:
            c.execute(text('INSERT INTO datasets(id,filename,bytes,status,metadata,error) VALUES (CAST(:id AS uuid),:filename,:bytes,:status,CAST(:metadata AS jsonb),:error)'),dict(id=fid,filename=filename,bytes=total,status=status,metadata=json.dumps(meta) if meta else None,error=error))
        return {'id':fid,'filename':filename,'bytes':total,'status':status,'metadata':meta,'error':error}
    except Exception:
        target.unlink(missing_ok=True)
        raise
@app.get('/api/las')
def datasets():
    with engine.connect() as c:
        return [dict(r) for r in c.execute(text('SELECT id::text,filename,bytes,status,created_at FROM datasets ORDER BY created_at DESC')).mappings()]
@app.delete('/api/las/{fid}')
def delete_dataset(fid:uuid.UUID):
    with engine.begin() as c:
        row=c.execute(text('SELECT filename FROM datasets WHERE id=:id FOR UPDATE'),{'id':fid}).mappings().first()
        if not row: raise HTTPException(404,'Dataset not found')
        target=ROOT/(str(fid)+Path(row['filename']).suffix.lower())
        try:
            target.unlink(missing_ok=True)
        except OSError as e:
            raise HTTPException(500,'Dataset record was kept, but its file could not be removed') from e
        c.execute(text('DELETE FROM datasets WHERE id=:id'),{'id':fid})
    return {'id':str(fid),'deleted':True}
@app.get('/api/las/{fid}')
def dataset(fid:uuid.UUID):
    with engine.connect() as c:
        row=c.execute(text('SELECT id::text,filename,bytes,status,metadata,error,created_at FROM datasets WHERE id=:id'),{'id':fid}).mappings().first()
        if not row: raise HTTPException(404,'Dataset not found')
        return dict(row)
@app.get('/api/las/{fid}/preview')
def las_preview(fid:uuid.UUID,max_points:int=Query(default=50000,ge=100,le=100000)):
    with engine.connect() as c:
        row=c.execute(text('SELECT filename FROM datasets WHERE id=:id'),{'id':fid}).mappings().first()
    if not row: raise HTTPException(404,'Dataset not found')
    extension=Path(row['filename']).suffix.lower()
    source=ROOT/(str(fid)+extension)
    if not source.is_file(): raise HTTPException(404,'LAS file is missing from storage')
    try:
        with laspy.open(source) as reader:
            header=reader.header
            point_count=int(header.point_count)
            stride=max(1,(point_count+max_points-1)//max_points)
            xyz_parts=[]; rgb_parts=[]; sampled=0; seen=0
            dimensions=set(reader.header.point_format.dimension_names)
            has_rgb={'red','green','blue'}.issubset(dimensions)
            for chunk in reader.chunk_iterator(100000):
                positions=np.arange(len(chunk),dtype=np.int64)+seen
                indexes=np.flatnonzero((positions%stride)==0)
                if indexes.size:
                    indexes=indexes[:max_points-sampled]
                    if indexes.size:
                        xyz_parts.append(np.column_stack((chunk.x[indexes],chunk.y[indexes],chunk.z[indexes])).astype(np.float32))
                        if has_rgb:
                            rgb=np.column_stack((chunk.red[indexes],chunk.green[indexes],chunk.blue[indexes])).astype(np.float32)
                            if rgb.max(initial=0)>255: rgb=np.rint(rgb/257)
                            rgb_parts.append(np.clip(rgb,0,255).astype(np.uint8))
                        sampled+=len(indexes)
                seen+=len(chunk)
                if sampled>=max_points: break
            xyz=np.concatenate(xyz_parts) if xyz_parts else np.empty((0,3),dtype=np.float32)
            colors=np.concatenate(rgb_parts) if rgb_parts else None
            crs=header.parse_crs()
            return {
                'point_count':point_count,
                'sample_count':len(xyz),
                'stride':stride,
                'point_format':int(header.point_format.id),
                'bounds':{'min':[float(v) for v in header.mins],'max':[float(v) for v in header.maxs]},
                'crs':crs.to_string() if crs else None,
                'points':xyz.tolist(),
                'colors':colors.tolist() if colors is not None else None,
            }
    except Exception as e:
        raise HTTPException(422,'LAS point preview failed: '+str(e)[:300]) from e
