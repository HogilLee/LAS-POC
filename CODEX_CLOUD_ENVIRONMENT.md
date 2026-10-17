# LAS-POC — Codex Cloud 개발환경 설정 및 인수인계

> 기준: 2026-10-18 | 저장소: HogilLee/LAS-POC
> 이 문서는 `LiDAR_GIS_PoC_Codex_Development_Guide.md`, README, Compose, Dockerfile, 프런트엔드 의존성을 확인해 작성했다. Codex Cloud에서 실행을 검증한 것은 아니다.

## 핵심 원칙
- 기존 Phase 1 + Phase 2 LAS 미리보기를 보존한다.
- Codex Cloud는 격리된 작업 실행 환경이지 영속 운영 서버가 아니다.
- 2D 작업 좌표계 EPSG:5186은 목표이며 미구현이다. 현재 GIS API/DB는 EPSG:4326이고 Cesium은 3D 지구본이다. 좌표계 변경 시 실제 변환을 수행한다.
- LAS CRS/수직 기준은 검증 전 신뢰하지 않는다. 점군 자동 지리 중첩 금지.
- VWorld 키, 폐쇄망 데이터, LAS 원본, DB 암호를 저장소나 로그에 남기지 않는다.

## 저장소 구조

```text
LAS-POC/
├── LiDAR_GIS_PoC_Codex_Development_Guide.md
├── README.md
└── lidar-gis-poc/
    ├── docker-compose.yml
    ├── backend/
    │   ├── Dockerfile
    │   ├── requirements.txt
    │   └── main.py
    └── frontend/
        ├── .env.example
        ├── package.json
        ├── package-lock.json
        ├── vite.config.js
        └── src/
            ├── main.jsx
            └── style.css
```

## 확인된 기술 스택
| 계층 | 기술 |
|---|---|
| 프런트 | React 19, Vite 6, CesiumJS |
| Node.js | 22.12 이상인 22.x 권장 |
| API | Python 3.12, FastAPI, Uvicorn |
| DB | PostgreSQL 16 + PostGIS 3.4 (Compose) |
| LiDAR | laspy + lazrs (업로드/미리보기) |
| PDAL | 현재 이미지 미설치, 추후 별도 worker |
| 배경지도 | VWorld WMTS (키·도메인·정책 검증 필요) |

## Codex Cloud 초기 구성
1. https://chatgpt.com/codex 에서 GitHub 연결 후 `HogilLee/LAS-POC` 저장소 접근 허용.
2. 환경(Environments)을 생성하고 `main` 브랜치 선택.
3. 사용 가능하면 Node.js 22.x와 Python 3.12를 사용.
4. 다음 Setup script 설정. 초기 작업은 네트워크 정책에 따른 패키지 설치 및 빌드만 수행.
5. 비밀값은 별도 Secrets 관리. `VITE_` 환경변수는 브라우저 번들에 포함됨.
6. 클라우드에 영속 PostGIS/Docker 데몬/웹 미리보기가 항상 존재한다고 가정하지 않음.

### Setup script
```bash
set -eu
cd lidar-gis-poc
node --version
npm --version
python3 --version

cd frontend
npm ci
npm run build
cd ..

python3 -m pip install -r backend/requirements.txt
python3 -m compileall -q backend

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  docker compose config --quiet
else
  echo 'Docker/Compose unavailable: DB integration deferred'
fi
```

네트워크, 패키지 저장소, Python 버전이 일치하지 않아 실패하면 정확한 오류를 기록한다. Docker 구문 검증 성공과 실제 DB 실행 성공은 구분한다.

## 검증 단계

### A — Docker가 없어도 가능
```bash
cd lidar-gis-poc
cd frontend && npm ci && npm run build && cd ..
python3 -m pip install -r backend/requirements.txt
python3 -m compileall -q backend
```
완료 기준: JS 빌드 및 Python 문법 검사 성공.

### B — Docker 데몬 사용 가능할 때만
```bash
cd lidar-gis-poc
docker compose config --quiet
docker compose up -d --build
docker compose ps
curl -f http://127.0.0.1:8000/api/health
curl -f http://127.0.0.1:8000/api/features
```
합성 LAS 테스트 데이터로 업로드, 미리보기, 삭제를 별도 확인한다. Compose의 개발용 DB 비밀번호 기본값은 운영 사용 금지.

### C — 브라우저 미리보기를 지원하는 경우
```bash
cd lidar-gis-poc/frontend
npm run dev -- --host 0.0.0.0
```
`localhost:5173`은 실행 환경 내부 주소이며 사용자 브라우저에 자동 공개되지 않을 수 있다. `/api` Vite 프록시는 `localhost:8000`을 사용하므로 같은 네트워크 네임스페이스 실행 여부를 확인한다.

## 현재 API
| Method | Path | 역할 |
|---|---|---|
| GET | /api/health | 상태 |
| GET, POST | /api/features | GIS 조회/등록 |
| PUT | /api/features/{fid} | GIS 수정 |
| POST | /api/las/upload | LAS/LAZ 업로드 |
| GET | /api/las | 데이터셋 목록 |
| GET | /api/las/{fid} | 상세 |
| GET | /api/las/{fid}/preview | 샘플 미리보기 |
| DELETE | /api/las/{fid} | 업로드 원본 및 등록정보 삭제 |

## Codex 첫 작업 프롬프트
```text
HogilLee/LAS-POC 저장소 main 브랜치에서 작업한다.
먼저 LiDAR_GIS_PoC_Codex_Development_Guide.md, 루트 및 하위 README를 읽고 실제 코드를 검사하라.
1. Node/Python/Docker 가용성과 버전을 기록하라.
2. frontend의 npm ci, npm run build를 실행하라.
3. backend 의존성 설치와 compileall을 실행하라.
4. Docker가 가능할 때만 Compose/API/DB 검증을 수행하라.
5. 장애 시 환경 문제와 코드 문제를 구분해 재현 로그를 남겨라.
6. 현행 LAS 업로드·미리보기와 GIS API 계약을 보존하라.
7. EPSG:5186은 향후 2D 작업 좌표계, 4326은 현재 API/DB 계약으로 취급하라.
8. LAS CRS와 고도 기준 검증 없이 지리 중첩하지 말라.
9. API 키, 민감 데이터, 비밀번호를 커밋하지 말라.
10. 변경이 있다면 PR을 작성하고 검증 범위와 미검증 항목을 기록하라.
```

## 후속 개발 우선순위
1. P0: 클라우드 재현 가능한 테스트와 의존성 버전 고정.
2. P1: EPSG:5186 2D 지도(OpenLayers 후보), 4326 API 좌표 변환.
3. P1: 폐쇄망 배경지도 — GeoTIFF 정사영상 + FileGDB→PostGIS→GeoServer SLD/WMTS (현 소스 미구현).
4. P1: 업로드 검증, 인증·감사 및 트랜잭션 정합성.
5. P2: PDAL 비동기 worker, 검증된 CRS/수직 datum, 3D Tiles 전환 실증.
6. P2: 폐쇄망 패키징, SBOM/취약점, 오프라인 타일 서비스.

## 완료 확인
- [ ] GitHub 저장소 연결 및 클라우드 환경 생성
- [ ] Node/Python 버전 확인
- [ ] npm ci 및 npm run build 성공
- [ ] Backend 패키지 설치 및 문법 검사
- [ ] Docker 가능 여부 확인
- [ ] 가능한 범위에서 API/DB 통합 테스트
- [ ] LAS 샘플 업로드·미리보기·삭제 테스트
- [ ] Cesium UI 및 외부 WMTS 사용조건 검증
- [ ] 비밀정보 커밋 여부 점검
- [ ] 미검증 항목과 재현 로그 기록

## 참조
- https://github.com/HogilLee/LAS-POC
- https://github.com/HogilLee/LAS-POC/blob/main/LiDAR_GIS_PoC_Codex_Development_Guide.md
- https://chatgpt.com/codex
