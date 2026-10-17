# LAS POC

React·Cesium 프런트엔드, FastAPI 백엔드, PostgreSQL/PostGIS 기반 LiDAR GIS 테스트 프로젝트입니다.

## 시작하기

```sh
cd lidar-gis-poc
docker compose up -d --build
cd frontend
cp .env.example .env
# .env의 VITE_VWORLD_KEY에 개발 도메인용 키 설정
npm ci
npm run dev
```

Windows PowerShell에서는 `cp` 대신 `Copy-Item`, 필요하면 `npm` 대신 `npm.cmd`를 사용하세요. Node.js 22.12 이상인 22.x 및 Docker Desktop Linux 엔진이 필요합니다.

화면: http://localhost:5173 / API 문서: http://localhost:8000/docs

## 이어서 작업하기

- [개발 인수인계 가이드](LiDAR_GIS_PoC_Codex_Development_Guide.md)
- [기능과 제한 사항](lidar-gis-poc/README.md)
- [주석이 포함된 React 진입점](lidar-gis-poc/frontend/src/main.jsx)

2D 작업 좌표계 정책은 EPSG:5186입니다. 현재 지도는 Cesium이며 해당 2D 투영 구현은 아직 없습니다. GIS API/DB는 EPSG:4326을 사용합니다. LAS 원본 좌표계와 수직 기준은 별도로 검증합니다.

API 키, LAS/LAZ 원본, Docker 볼륨(DB·업로드 파일), node_modules, dist는 저장소에 포함하지 않습니다. 다른 환경에서는 .env를 별도로 설정해야 합니다. VWorld 외부 배경지도는 폐쇄망에서 내부 서비스로 대체해야 합니다.
