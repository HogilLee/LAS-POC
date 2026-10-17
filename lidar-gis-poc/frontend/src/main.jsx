/*
 * 읽는 순서: App(전체 화면) → 이벤트 함수(upload/deleteDataset) → ViewerPopup(팝업).
 * React 컴포넌트는 JSX(HTML처럼 보이는 JavaScript)를 반환하는 함수다.
 * state가 바뀌면 함수를 다시 실행해 화면을 갱신하므로 DOM을 직접 수정하지 않는다.
 * useState: [현재 값, 값을 바꾸는 함수]. setter 호출은 다음 렌더링에 반영된다.
 * useRef: 렌더링 사이에 유지하는 보관함. .current 변경 자체는 화면을 갱신하지 않는다.
 * useEffect: 화면 반영 후 실행하는 작업. Cesium 생성·이벤트 등록·통신 등에 사용한다.
 * Effect의 return 함수는 재실행 직전/화면 제거 시 자원을 정리한다.
 * 의존성 []는 컴포넌트가 처음 화면에 붙을 때, [값]은 최초 및 그 값 변경 시 실행한다.
 */
import React,{useEffect,useRef,useState} from 'react';
import{createRoot}from'react-dom/client';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import './style.css';

// 같은 호스트의 API 경로. 개발 시 vite.config.js의 proxy가 백엔드로 전달한다.
// 폐쇄망 배포 시에도 /api를 내부 FastAPI로 연결하는 웹 서버 설정이 필요하다.
const API='/api';
// Vite가 빌드 시 주입하는 브라우저 공개용 설정이다. 키 변경 시 개발 서버 재시작/재빌드 필요.
const VWORLD_KEY=import.meta.env.VITE_VWORLD_KEY?.trim();
const BASEMAPS={Base:{label:'일반',extension:'png'},Satellite:{label:'위성',extension:'jpeg'}};
// 메인 지도와 팝업의 공통 Cesium 옵션. 실제 지형 대신 높이 없는 타원체를 사용한다.
// 현재는 Cesium 지도이며 EPSG:5186 기반 2D 지도 구현은 아직 별도 작업이다.
const viewerOptions={
 baseLayer:false,
 terrainProvider:new Cesium.EllipsoidTerrainProvider(),
 animation:false,
 timeline:false,
 geocoder:false,
 homeButton:false,
 sceneModePicker:false,
 baseLayerPicker:false,
};

/**
 * 배경지도 종류(Base/Satellite)에 맞는 VWorld WMTS 공급자를 만든다.
 * 일반은 PNG, 위성은 JPEG 타일을 사용한다. 반환한 공급자를 Viewer에 추가해야 표시된다.
 * [폐쇄망] 아래 URL은 외부 인터넷 연결이 필요하다. 내부 타일 서버로 대체하고
 * URL뿐 아니라 레이어명·타일 격자·좌표계·이용권한도 내부 서비스에 맞춰야 한다.
 */
function vworldProvider(basemap){
 const {extension}=BASEMAPS[basemap];
 return new Cesium.WebMapTileServiceImageryProvider({
  url:`https://api.vworld.kr/req/wmts/1.0.0/${encodeURIComponent(VWORLD_KEY)}/${basemap}/{TileMatrix}/{TileRow}/{TileCol}.${extension}`,
  layer:basemap,style:'default',format:`image/${extension}`,tileMatrixSetID:'GoogleMapsCompatible',maximumLevel:19,
  credit:new Cesium.Credit('© VWorld'),
 });
}

/**
 * 지도 또는 LAS 미리보기 팝업 컴포넌트.
 * 인자는 부모 App이 넘긴 props 객체를 구조 분해한 것(일반 JavaScript 문법)이다.
 * popup.type='map': 선택한 경위도의 지구본, 'las': 원본 좌표의 독립 점군 화면.
 * onClose는 부모의 popup 상태를 비우는 콜백이며, 이 컴포넌트가 사라지면 정리 함수가 실행된다.
 */
function ViewerPopup({popup,basemap,onClose}){
 // ref={container}인 div가 생성되면 container.current에 실제 DOM 요소가 들어간다.
 const container=useRef(null);
 // 요청 중 표시, 오류 문구, 서버가 반환한 점군 요약을 각각 화면 상태로 관리한다.
 const [loading,setLoading]=useState(popup.type==='las');
 const [error,setError]=useState('');
 const [summary,setSummary]=useState(null);

 // 팝업이 열리거나 popup/basemap이 바뀔 때 Viewer를 구성한다.
 useEffect(()=>{
  const viewer=new Cesium.Viewer(container.current,viewerOptions);
  // 요청 자체를 중단하지는 않는다. 닫힌 팝업에 늦은 응답을 적용하지 않기 위한 플래그다.
  let cancelled=false;
  let pointCollection=null;
  if(popup.type==='map'){
   if(VWORLD_KEY){
    const provider=vworldProvider(basemap);
    provider.errorEvent.addEventListener(()=>{if(!cancelled)setError('VWorld 배경지도 타일 일부 요청에 실패했습니다. API 키 권한 또는 네트워크를 확인하세요.')});
    viewer.imageryLayers.addImageryProvider(provider,0);
   }
   viewer.camera.flyTo({
    destination:Cesium.Cartesian3.fromDegrees(popup.location.lon,popup.location.lat,3500),
    orientation:{heading:0,pitch:Cesium.Math.toRadians(-55),roll:0},
   });
  }else{
   viewer.scene.globe.show=false;
   viewer.scene.skyAtmosphere.show=false;
   viewer.scene.fog.enabled=false;
   viewer.scene.backgroundColor=Cesium.Color.fromCssColorString('#101925');
   viewer.scene.screenSpaceCameraController.minimumZoomDistance=0.01;
   // 내부 백엔드에서 샘플 점만 가져온다. LAS 전체 파일을 브라우저에서 읽는 방식이 아니다.
   fetch(`${API}/las/${popup.dataset.id}/preview`)
    // 1단계: HTTP 응답을 JSON으로 해석하고 실패 상태면 아래 catch로 넘긴다.
    .then(async response=>{
     const data=await response.json();
     if(!response.ok)throw new Error(data.detail||'점군 미리보기를 불러오지 못했습니다.');
     return data;
    })
    // 2단계: 샘플 좌표/색상으로 Cesium 점 객체를 만들고 카메라를 맞춘다.
    .then(data=>{
     if(cancelled)return;
     setSummary(data);
     pointCollection=new Cesium.PointPrimitiveCollection();
     const positions=[];
     for(let i=0;i<data.points.length;i++){
      const [x,y,z]=data.points[i];
      // 원본 XYZ를 그대로 표시한다. 경위도 변환이나 EPSG:5186 변환을 수행하지 않는다.
      const position=new Cesium.Cartesian3(x,y,z);
      positions.push(position);
      const rgb=data.colors?.[i];
      pointCollection.add({
       position,
       pixelSize:3,
       color:rgb?Cesium.Color.fromBytes(rgb[0],rgb[1],rgb[2]):Cesium.Color.CYAN,
       outlineColor:Cesium.Color.BLACK,
       outlineWidth:0,
      });
     }
     viewer.scene.primitives.add(pointCollection);
     // 모든 점을 감싸는 구로 크기와 중심을 계산해 점군 전체를 바라보도록 설정한다.
     if(positions.length){
      const sphere=Cesium.BoundingSphere.fromPoints(positions);
      const center=sphere.center;
      const distance=Math.max(sphere.radius*2.5,1);
      const destination=new Cesium.Cartesian3(center.x+distance,center.y-distance,center.z+distance);
      const direction=Cesium.Cartesian3.normalize(
       Cesium.Cartesian3.subtract(center,destination,new Cesium.Cartesian3()),
       new Cesium.Cartesian3(),
      );
      viewer.camera.setView({destination,orientation:{direction,up:Cesium.Cartesian3.UNIT_Z}});
     }
     setLoading(false);
    })
    // 통신/응답/렌더링 준비 과정의 오류를 팝업에 표시한다.
    .catch(err=>{if(!cancelled){setError(err.message);setLoading(false)}});
  }
  // 팝업 종료/Effect 재실행 시 GPU 자원과 Viewer를 해제한다.
  return()=>{
   cancelled=true;
   if(pointCollection&&!viewer.isDestroyed())viewer.scene.primitives.remove(pointCollection);
   if(!viewer.isDestroyed())viewer.destroy();
  };
 },[popup,basemap]);

 // JSX: {표현식}으로 JS 값을 삽입하고, 조건 && JSX로 조건부 표시한다.
 // 배경 클릭은 target(실제 클릭 요소)이 currentTarget(배경 div)과 같을 때만 닫는다.
 return <div className="popup-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
  <section className="viewer-popup" role="dialog" aria-modal="true" aria-labelledby="popup-title">
   <header className="popup-header">
    <div>
     <h2 id="popup-title">{popup.type==='map'?'VWorld 3D 지도':'LAS 점군 미리보기'}</h2>
     <p>{popup.type==='map'
      ?`선택 위치 ${popup.location.lat.toFixed(6)}, ${popup.location.lon.toFixed(6)}`
      :popup.dataset.filename}</p>
    </div>
    <button type="button" className="close-button" onClick={onClose} aria-label="팝업 닫기">닫기</button>
   </header>
   {popup.type==='map'&&<p className="popup-note">Cesium 3D 지구본과 VWorld WMTS 배경지도입니다. 건물 3D 타일·실제 고도 지형은 별도 서비스 연동이 필요합니다.</p>}
   {popup.type==='las'&&<p className="popup-note">LAS 원본 좌표의 독립 미리보기입니다. 위치/고도를 지도와 맞추려면 CRS 및 수직 기준 검증이 필요합니다.</p>}
   <div className="popup-viewer" ref={container}/>
   {loading&&<div className="popup-status">LAS 점군을 읽는 중...</div>}
   {error&&<div className="popup-warning" role="alert">{error}</div>}
   {summary&&<div className="point-summary">
    {summary.sample_count.toLocaleString()} / {summary.point_count.toLocaleString()} 점 표시
    {' · '}CRS: {summary.crs||'미확인'}
    {' · '}좌표 {summary.bounds.min.map(v=>v.toFixed(2)).join(', ')} ~ {summary.bounds.max.map(v=>v.toFixed(2)).join(', ')}
   </div>}
  </section>
 </div>;
}

/** 전체 화면의 최상위 컴포넌트. 레이어 목록·배경지도·팝업 상태를 관리한다. */
function App(){
 // Cesium/DOM 객체는 ref로 보관한다. pickModeRef는 한 번 등록한 클릭 콜백에 최신 모드를 전달한다.
 const map=useRef(null),viewer=useRef(null),basemapLayer=useRef(null),pickModeRef=useRef(false);
 // 아래 상태를 setter로 변경하면 React가 App을 다시 실행하고 필요한 화면을 갱신한다.
 const [basemap,setBasemap]=useState('Base');
 const [pickMode,setPickMode]=useState(false);
 const [popup,setPopup]=useState(null);
 const [datasets,setDatasets]=useState([]),[deleting,setDeleting]=useState(null),[msg,setMsg]=useState('준비');

 /** 서버의 LAS 데이터셋 목록을 다시 읽어 사이드바를 갱신한다. 최초 진입/추가/삭제 후 호출. */
 async function refresh(){
  try{
   const response=await fetch(API+'/las');
   if(!response.ok)throw new Error('레이어 목록 조회에 실패했습니다.');
   setDatasets(await response.json());
  }catch(e){setMsg('API 연결 실패: '+e.message)}
 }

 // 최초 화면 연결 시 메인 Viewer와 클릭 이벤트를 만들고 데이터셋 목록을 읽는다.
 useEffect(()=>{
  const v=new Cesium.Viewer(map.current,viewerOptions);
  viewer.current=v;
  v.camera.flyTo({destination:Cesium.Cartesian3.fromDegrees(126.717,35.016,12000)});
  const handler=new Cesium.ScreenSpaceEventHandler(v.scene.canvas);
  // '3D지도 전환' 모드에서만 클릭을 처리한다. 지구 타원체 교차점을 경위도로 바꿔 팝업에 전달.
  // 실제 지형 고도를 추출하거나 EPSG:5186 좌표를 계산하는 처리는 아니다.
  handler.setInputAction(event=>{
   if(!pickModeRef.current)return;
   const position=v.camera.pickEllipsoid(event.position,v.scene.globe.ellipsoid);
   if(!position){setMsg('지구본 위의 위치를 선택하세요');return}
   const cartographic=Cesium.Cartographic.fromCartesian(position);
   setPopup({type:'map',location:{lon:Cesium.Math.toDegrees(cartographic.longitude),lat:Cesium.Math.toDegrees(cartographic.latitude)}});
   pickModeRef.current=false;
   setPickMode(false);
   setMsg('선택한 위치의 3D 지도 팝업을 열었습니다');
  },Cesium.ScreenSpaceEventType.LEFT_CLICK);
  refresh();
  // App 제거 시 이벤트 핸들러와 WebGL 자원을 해제해 중복 이벤트/메모리 누수를 방지한다.
  return()=>{
   handler.destroy();
   basemapLayer.current=null;
   v.destroy();
   viewer.current=null;
  };
 },[]);

 // state가 바뀔 때 ref도 동기화한다. 최초 등록된 Cesium 콜백이 과거 state를 읽는 문제를 피한다.
 useEffect(()=>{
  pickModeRef.current=pickMode;
 },[pickMode]);

 // 선택된 배경지도가 바뀌면 이미지 레이어만 교체한다. Viewer와 카메라 위치는 유지한다.
 useEffect(()=>{
  const v=viewer.current;
  if(!v||!VWORLD_KEY)return;
  const provider=vworldProvider(basemap);
  provider.errorEvent.addEventListener(()=>setMsg('VWorld 배경지도 타일 일부 요청 실패: 키 권한·허용 도메인·네트워크를 확인하세요'));
  if(basemapLayer.current)v.imageryLayers.remove(basemapLayer.current,true);
  basemapLayer.current=v.imageryLayers.addImageryProvider(provider,0);
 },[basemap]);

 /**
  * 파일 input의 onChange 처리: 첫 파일 → FormData → 업로드 API → 목록 갱신 → 미리보기.
  * async/await는 비동기 완료를 기다리는 JS 문법이다. 서버에서 헤더 검사/원본 저장을 담당한다.
  */
 async function upload(event){
  const file=event.target.files?.[0];
  if(!file)return;
  const form=new FormData();
  form.append('file',file);
  setMsg('업로드 및 LAS 헤더 검사 중...');
  try{
   const response=await fetch(API+'/las/upload',{method:'POST',body:form});
   const data=await response.json();
   if(!response.ok)throw new Error(data.detail||JSON.stringify(data));
   setMsg(`업로드 완료: ${data.status}`);
   await refresh();
   setPopup({type:'las',dataset:{id:data.id,filename:data.filename}});
  }catch(err){setMsg(err.message)}
  // 성공/실패와 관계없이 초기화해 같은 파일을 다시 선택해도 change가 발생하도록 한다.
  finally{event.target.value=''}
 }

 /** 사용자 확인 후 원본 파일과 DB 등록 정보 삭제를 API에 요청하고 목록/열린 팝업을 정리한다. */
 async function deleteDataset(dataset){
  if(!window.confirm(`'${dataset.filename}' 점군 파일과 등록 정보를 삭제할까요?`))return;
  // 삭제 중인 항목의 버튼만 비활성화한다. finally에서 해제한다.
  setDeleting(dataset.id);
  try{
   const response=await fetch(`${API}/las/${dataset.id}`,{method:'DELETE'});
   const result=await response.json();
   if(!response.ok)throw new Error(result.detail||'점군 삭제에 실패했습니다.');
   if(popup?.type==='las'&&popup.dataset.id===dataset.id)setPopup(null);
   setMsg('점군 파일과 레이어 등록 정보를 삭제했습니다.');
   await refresh();
  }catch(err){setMsg(err.message)}
  finally{setDeleting(null)}
 }

 // 아래는 화면 선언부다. onClick={()=>함수(값)}은 클릭 시 실행할 콜백을 전달한다.
 // 배열.map은 항목마다 JSX를 만든다. key는 React가 각 항목을 구별하는 안정적인 식별자다.
 // setPickMode(value=>!value)는 이전 상태를 받아 반전하는 setter의 함수형 사용법이다.
 return <div className="app">
  <aside>
   <h2>3D LiDAR GIS PoC</h2><p>GIS 정비 · Phase 2</p>
   <section>
    <div className="layer-heading">
     <h3>레이어 관리</h3>
     <label className="add-layer-button">+ LAS/LAZ 추가<input type="file" accept=".las,.laz" onChange={upload}/></label>
    </div>
    <small>배경지도와 업로드한 점군 레이어를 관리합니다. 새 레이어 형식은 추후 추가할 수 있습니다.</small>
    <div className="layer-group">
     <h4>배경지도</h4>
     {Object.entries(BASEMAPS).map(([id,{label}])=><div className="layer-row" key={id}>
      <span className="layer-mark map-mark" aria-hidden="true"/>
      <span className="layer-name">VWorld {label}<small>{basemap===id?'현재 지도':'배경지도'}</small></span>
      <button type="button" className="layer-switch" disabled={!VWORLD_KEY} aria-pressed={basemap===id} onClick={()=>setBasemap(id)}>{basemap===id?'사용 중':'사용'}</button>
     </div>)}
     {!VWORLD_KEY&&<small className="layer-hint">VWorld 키를 설정하면 사용할 수 있습니다.</small>}
    </div>
    <div className="layer-group">
     <h4>점군 레이어 <span>{datasets.length}</span></h4>
    {datasets.map(dataset=><div className="item" key={dataset.id}>
     <div className="layer-row">
      <span className="layer-mark point-mark" aria-hidden="true"/>
      <span className="layer-name">{dataset.filename}<small>{dataset.status} · {(dataset.bytes/1048576).toFixed(1)} MB</small></span>
     </div>
     <div className="layer-actions">
      <button type="button" className="item-action" onClick={()=>setPopup({type:'las',dataset})}>점군 보기</button>
      <button type="button" className="delete-action" disabled={deleting===dataset.id} onClick={()=>deleteDataset(dataset)}>{deleting===dataset.id?'삭제 중...':'삭제'}</button>
     </div>
    </div>)}
     {!datasets.length&&<p className="empty-layers">등록된 점군 레이어가 없습니다.</p>}
    </div>
    <div className="layer-group">
     <h4>추가 예정</h4>
     <div className="layer-placeholder">GIS 점 · 선 · 면 레이어</div>
     <div className="layer-placeholder">기타 공간 데이터 레이어</div>
    </div>
   </section>
   <footer>{msg}</footer>
  </aside>
  <main className="map-panel">
   <div className="map-view" ref={map}/>
   <div className="map-tools">
    <button type="button" className={pickMode?'pick-active':''} aria-pressed={pickMode} onClick={()=>{setPickMode(value=>!value);setMsg(pickMode?'위치 선택을 취소했습니다':'지도에서 위치를 클릭해 3D 지도를 여세요')}}>3D지도 전환</button>
    <div className="basemap-toggle" role="group" aria-label="배경지도 선택">{Object.entries(BASEMAPS).map(([id,{label}])=><button key={id} type="button" aria-pressed={basemap===id} disabled={!VWORLD_KEY} onClick={()=>setBasemap(id)}>{label}</button>)}</div>
   </div>
   {pickMode&&<div className="map-notice" role="status">팝업으로 볼 위치를 지도에서 클릭하세요. <button type="button" className="notice-cancel" onClick={()=>{setPickMode(false);setMsg('위치 선택을 취소했습니다')}}>취소</button></div>}
   {!VWORLD_KEY&&<div className="map-notice key-notice" role="status">VWorld 배경지도를 사용하려면 frontend/.env에 VITE_VWORLD_KEY를 설정하세요.</div>}
  </main>
  {/* popup이 있을 때만 자식 컴포넌트를 생성. 닫기 콜백은 부모 상태를 null로 바꾼다. */}
  {popup&&<ViewerPopup popup={popup} basemap={basemap} onClose={()=>setPopup(null)}/>}
 </div>;
}

// index.html의 #root에 React 화면을 연결하는 진입점. App 안에서 자식 컴포넌트가 구성된다.
// [폐쇄망] JS/CSS/Cesium 정적 자산은 빌드 산출물로 배포하고 VWorld 외부 연결은 별도 대체한다.
createRoot(document.getElementById('root')).render(<App/>);
