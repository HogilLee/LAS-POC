# LiDAR GIS PoC — Phase 2 preview

## Prerequisites
- Docker Desktop with Linux containers
- Node.js 20.19+ or 22.12+
- VWorld WMTS API key authorized for your development origin

## Start
```bash
docker compose up -d --build
cd frontend
cp .env.example .env
# edit .env and supply VITE_VWORLD_KEY
npm install
npm run dev
```
Open http://localhost:5173 and API docs http://localhost:8000/docs.

## Scope
- CesiumJS 3D viewer with ellipsoid terrain (no elevation terrain yet)
- Optional VWorld WMTS background (requires key and service validation)
- Select a location on the main map to open a Cesium 3D map popup with the VWorld WMTS background
- LAS/LAZ header inspection and a local-coordinate point-cloud preview (up to 50,000 sampled points)
- Layer manager for VWorld basemaps and uploaded LAS/LAZ point clouds, including dataset deletion
- PostGIS GeoJSON feature API remains available; GIS feature editing controls are not currently exposed in the UI
- LAS/LAZ upload up to 1 GiB, LASF signature check, persisted metadata/status
- CRS is reported from LAS metadata but never used to place the cloud on the map automatically. The supplied sample's EPSG:4326 declaration does not match its coordinate range and must be independently verified.
- Preview endpoint: `GET /api/las/{id}/preview?max_points=50000` (100–100,000 points)
- Delete endpoint: `DELETE /api/las/{id}` removes the stored file and dataset record
- No PDAL processing, 3D buildings/terrain, coordinate reprojection, background job queue, audit history, authentication or offline map package yet.

## Manual PDAL inspection (optional, separate installed PDAL environment)
```bash
pdal info --summary sample.las
pdal info --metadata sample.las
```

## Quick API checks
```bash
curl http://localhost:8000/api/health
curl -X POST http://localhost:8000/api/features -H 'Content-Type: application/json' -d '{"name":"Test tower","geometry":{"type":"Point","coordinates":[126.717,35.016]}}'
curl http://localhost:8000/api/features
curl -F 'file=@sample.las' http://localhost:8000/api/las/upload
```

After uploading, open the LAS entry's **점군 보기** action in the UI. The preview streams the LAS/LAZ in bounded chunks and returns a uniformly sampled subset; it displays in original local coordinates rather than overlaying unverified coordinates on VWorld.

Delete a dataset from **레이어 관리 → 점군 레이어 → 삭제**. The app asks for confirmation before removing both the stored source file and its database entry.

On the main map, choose **3D지도 전환** and click the globe to open a location-centered popup. This currently uses CesiumJS with the VWorld WMTS imagery layer. It is not the official VWorld 3D buildings/terrain service; those require separate service/API verification and authorization.

## Hybrid/offline transition
Pin exact image/npm/pip versions, mirror npm and PyPI packages, export Docker images with `docker save`, preload with `docker load`, configure internal VWorld replacement or licensed offline map data, and add authentication, audit trail, malware scanning and upload quotas before real operational deployment.
