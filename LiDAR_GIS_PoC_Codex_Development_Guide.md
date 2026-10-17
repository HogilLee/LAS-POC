# 3D LiDAR GIS PoC — Codex 개발 인수인계 및 환경 구성 명세서

> 작성 기준: 2026-10-16 / 대상: Codex 작업 에이전트 및 개발 담당자  
> 상태: Phase 1 기반에 Phase 2 미리보기 기능 추가. Docker 업로드/API 및 브라우저 팝업 검증 완료; VWorld 키별 허용범위와 운영 환경은 별도 확인 필요.

## 0. Codex에게 가장 먼저 전달할 지시

이 저장소는 LiDAR 기반 3D GIS 정비 PoC다. Phase 1의 기존 기능을 보존하고 Phase 2 미리보기 기능을 이어서 개발한다. 사용자의 개발환경은 외부망 개발 후 폐쇄망 이관(hybrid)이다. LAS 헤더의 CRS 표기는 신뢰 가능한 위치 근거로 간주하지 말고 데이터 값과 별도 검증한다. 임의로 좌표계나 고도 기준을 확정하지 말 것. 정비 대상은 LAS 점 자체가 아니라 기존 GIS 점/선/면 객체다. 현재 구현 상태를 검증 없이 '완료'라고 표시하지 말 것. 브이월드 API 키는 코드/로그/커밋에 노출하지 말 것.

**1차 종료 조건:** Docker DB/API 기동, 프런트엔드 빌드/접속, API CRUD 및 LAS 업로드 검증, 지도 렌더링, 환경변수 구성, 실패 시 재현 가능한 오류 기록.

## 1. 프로젝트 목표와 범위

### 목표
1. CesiumJS 기반 3D 지도에 VWorld 배경지도를 중첩한다.
2. 기존 GIS 객체(Point/LineString/Polygon)를 조회하고 정비한다.
3. 레이어 관리 화면에서 VWorld 배경지도 및 LAS/LAZ 데이터셋을 관리한다.
4. 이후 PDAL 분석, 좌표계 검증, 3D Tiles 변환, 점군 시각화로 확장한다.
5. 외부망 개발 산출물을 의존성/이미지까지 패키징하여 폐쇄망에 이관한다.

### Phase 1 포함
- CesiumJS 기본 지구본(현재 지형은 타원체 지형)
- VWorld WMTS 연계 코드(실제 키·응답·약관 미검증)
- FastAPI + PostGIS GIS 객체 CRUD 중 조회/등록/수정 (삭제 없음)
- GIS 객체 API는 Point/LineString/Polygon을 지원. 편집 UI는 레이어 관리 화면으로 대체됨
- LAS/LAZ 업로드, 확장자/매직바이트 검사, 1 GiB 기본 상한
- 업로드 데이터셋 목록/상세 조회 및 원본 파일/등록 정보 삭제

### Phase 1 제외 / Phase 2 미완료
- PDAL 실행 환경과 비동기 처리: 기본 API 이미지에 설치되어 있지 않음. 현재는 laspy 기반 헤더 검사와 샘플 점군 미리보기 제공
- 3D Tiles 변환 및 대용량 점군 스트리밍 렌더링
- LAS 원본 CRS·수직 기준을 검증하는 좌표 변환과 VWorld 지도 중첩
- 공식 VWorld 3D 건물/지형 API 연동 (현재 VWorld WMTS만 사용)
- 선/면 화면 편집, 점군 점 단위 편집
- GIS 수정 이력, 사용자 인증/권한, 보안 검사, 악성 파일 검사
- 실제 3D 지형, 오프라인 배경지도, 운영 배포

## 2. 기술 스택

| 계층 | 기술 | 현재 상태/주의 |
|---|---|---|
| 개발 OS | Windows 11 64-bit | 권장, WSL2/Docker Desktop 지원 확인 |
| IDE/에이전트 | VS Code + Codex | 프로젝트 폴더 열고 작업 |
| 컨테이너 | Docker Desktop, Docker Compose | Linux 컨테이너 모드 |
| Node.js | 20.19+ 또는 22.12+ | 프런트엔드 빌드/실행 |
| 프런트엔드 | React 19, Vite 6, CesiumJS 1.x | package.json에 `^` 범위 존재, 잠금 필요 |
| API | Python 3.12, FastAPI, Uvicorn | backend/Dockerfile 참조 |
| 공간 DB | PostgreSQL 16 + PostGIS 3.4 | Docker 이미지 `postgis/postgis:16-3.4` |
| LiDAR 분석 | laspy/lazrs (헤더 검사·미리보기), PDAL | laspy/lazrs 사용; PDAL은 컨테이너에 미설치 |
| 배경지도 | VWorld WMTS | 키/도메인/요청 URL 및 사용조건 검증 필요 |
| 웹 배포 | Vite 개발 서버 | 운영·폐쇄망은 정적 빌드+Nginx 등 별도 설계 |

**버전 정책:** 최초 실행 성공 후 `package-lock.json`, Python 패키지 버전, Docker 이미지 digest를 고정한다. 폐쇄망 반입 전 라이선스·취약점 점검이 필요하다.

## 3. 실제 소스 디렉터리 구조

```text
lidar-gis-poc/
├── README.md
├── docker-compose.yml
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── main.py
└── frontend/
    ├── .env.example
    ├── package.json
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── main.jsx
        └── style.css
```

이 문서는 현재 ZIP의 실제 파일을 확인하여 작성했다. `worker/`, `nginx/`, `tests/` 등은 아직 존재하지 않으며 필요 시 Codex가 추가한다.

## 4. 개발환경 준비 (Windows PowerShell)

### 필수
1. Git, VS Code 및 Codex 사용환경 구성.
2. WSL2 설치/활성화 후 Docker Desktop Linux 컨테이너 실행.
3. Node.js LTS(상기 버전 조건 충족) 설치.
4. VWorld 개발자 API 키 발급 및 개발 origin/도메인 등록.
5. 소스 ZIP을 작업 폴더에 압축 해제.

### 사전 점검
```powershell
wsl --status
docker --version
docker compose version
node --version
npm --version
git --version
```

### 실행 순서
프로젝트 최상위 폴더에서:
```powershell
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 api
Invoke-RestMethod http://localhost:8000/api/health
```

다른 터미널에서:
```powershell
cd frontend
Copy-Item .env.example .env
# .env에 VITE_VWORLD_KEY 설정 (절대 커밋하지 않음)
npm install
npm run build
npm run dev
```

접속: `http://localhost:5173` / Swagger `http://localhost:8000/docs`.

**주의:** Vite 개발 서버는 로컬 개발용이다. `.env`의 `VITE_` 변수는 브라우저 번들에 포함되므로 비밀키 저장 수단이 아니다. VWorld 브라우저 공개용 키의 허용 도메인/쿼터를 설정하고, 필요 시 서버 프록시 구조를 검토한다.

## 5. 컨테이너 및 네트워크 구성

```text
[Windows Browser :5173]
        │  React + CesiumJS (Vite)
        ├── VWorld WMTS (외부 HTTPS, 정책 확인)
        │
        └── /api → Vite proxy → FastAPI :8000
                                      │
                                      ├── PostgreSQL/PostGIS :5432 (내부 네트워크)
                                      └── Docker uploads volume

향후: API → 비동기 PDAL Worker → 3D Tiles 저장소 → 정적 타일 배포 → CesiumJS
```

- DB 포트는 호스트에 공개하지 않는다.
- API 포트는 현재 `127.0.0.1:8000:8000`으로 로컬 바인딩.
- `pgdata`, `uploads`는 Docker named volume에 저장.
- 개발용 DB 계정 `poc`과 기본 암호는 운영 사용 금지. `.env` 및 비밀관리 체계로 분리.

## 6. API 계약(현재 코드 기준)

| 메서드 | 경로 | 동작 |
|---|---|---|
| GET | `/api/health` | 상태 확인 |
| GET | `/api/features` | 전체 GIS 객체 조회 |
| POST | `/api/features` | GIS 객체 생성 |
| PUT | `/api/features/{fid}` | GIS 객체 수정 |
| POST | `/api/las/upload` | LAS/LAZ multipart 업로드 (`file`) |
| GET | `/api/las` | 데이터셋 목록 |
| GET | `/api/las/{fid}` | 데이터셋 상세 |
| DELETE | `/api/las/{fid}` | LAS/LAZ 원본 파일과 등록 정보 삭제 |
| GET | `/api/las/{fid}/preview` | 제한된 점군 미리보기 |

GIS 입력 예:
```json
{
  "name": "Test tower",
  "geometry": { "type": "Point", "coordinates": [126.717, 35.016] }
}
```

**좌표 주의:** GIS API는 GeoJSON 경도/위도 순서 `[longitude, latitude]`, SRID 4326으로 저장한다. 이는 LAS 원본 좌표계가 EPSG:4326이라는 뜻이 아니다. LAS의 수평/수직 CRS를 메타데이터에서 확인하기 전에는 자동 위치 보정하지 않는다.

### API 빠른 테스트(PowerShell)
```powershell
Invoke-RestMethod http://localhost:8000/api/health
$body = @{name='Test tower'; geometry=@{type='Point';coordinates=@(126.717,35.016)}} | ConvertTo-Json -Depth 5
Invoke-RestMethod http://localhost:8000/api/features -Method Post -ContentType 'application/json' -Body $body
Invoke-RestMethod http://localhost:8000/api/features
# LAS 샘플이 준비된 뒤:
curl.exe -F "file=@C:\path\to\sample.las" http://localhost:8000/api/las/upload
```

## 7. 공간정보/데이터 모델

### 확정된 2D 좌표계 정책 (2026-10-18)

- 사용자 지정에 따라 2D 지도 작업 좌표계는 **EPSG:5186**으로 한다.
- 이는 2D 지도 구현의 기준이다. 현재 메인 지도는 Cesium Viewer이며, EPSG:5186 투영의 2D 지도는 아직 구현되지 않았다.
- 2D 지도 도입 시 EPSG:5186을 지원하는 지도 엔진과 좌표 변환을 적용한다. VWorld 배경지도 타일의 원래 좌표계와 2D 작업 좌표계를 구분하고 재투영한다.
- 기존 GIS API의 GeoJSON 경도/위도 및 DB SRID 4326 계약은 유지한다. EPSG:5186 작업 좌표와 API 좌표 사이에는 실제 좌표 변환을 수행한다. SRID 번호만 바꾸어 좌표를 재해석하지 않는다.
- 3D 지도는 기존 Cesium 좌표 처리를 유지한다. LAS 원본 CRS와 고도 기준은 별도로 검증하며, 2D 작업 좌표계 지정만으로 LAS 원본을 EPSG:5186으로 간주하지 않는다.

현재 DB 테이블:
- `features`: UUID, name, PostGIS `geometry(Geometry,4326)`, updated_at.
- `datasets`: UUID, filename, bytes, status, JSONB metadata, error, created_at.

추후 권장 테이블:
- `gis_edit_history`: 수정 전후 GeoJSON, 사용자, 시각, 변경 사유.
- `lidar_jobs`: 처리 작업 상태, 실패 사유, 재시도 횟수.
- `lidar_assets`: LAS 원본, COPC, 3D Tiles 경로, 해시, 버전.
- `spatial_reference`: 원본 수평 CRS, 수직 datum, 변환 방식, 정확도.

원본 LAS/LAZ는 파일/객체 저장소에 두고 DB에는 메타데이터와 경로만 저장한다. 운영 데이터는 버전/감사 추적을 설계한다.

## 8. LiDAR 처리 계획 및 Phase 2 미리보기

현재 구현된 범위:
- 사이드바의 GIS 점 객체 편집 패널을 레이어 관리 화면으로 대체. VWorld 배경지도 전환, LAS/LAZ 업로드·목록, 점군 미리보기 및 삭제 제공.
- 삭제 시 사용자 확인 후 LAS/LAZ 원본 파일과 데이터셋 DB 등록 정보를 함께 제거. GIS Feature API는 유지하지만 현재 화면에는 편집 UI를 노출하지 않음.
- LAS/LAZ 업로드 후 laspy로 헤더(점 수, 포인트 포맷, 범위, 스케일/오프셋, CRS 표기) 검사.
- `GET /api/las/{id}/preview?max_points=50000`에서 원본을 청크 단위로 읽고 균일 간격 샘플(기본 50,000점, 최대 100,000점)을 반환.
- 프런트엔드 팝업에서 샘플 점군을 LAS 원본 좌표 그대로 표시. CRS가 검증되지 않았으므로 지구본 위치에는 자동 배치하지 않음.
- 메인 지도에서 **3D지도 전환**을 누르고 위치를 클릭하면 해당 경도의 Cesium 3D 지구본 팝업 표시. 배경은 VWorld WMTS이며, 공식 VWorld 3D 건물/지형 서비스와 다름.

검증된 샘플은 헤더에 EPSG:4326을 선언하지만 좌표 범위가 인천 경위도와 일치하지 않는다. 그러므로 CRS 표기만으로 VWorld 지도 오버레이나 재투영을 수행하지 않는다.

```text
LAS/LAZ 업로드
  → 확장자·파일 헤더·용량·보안 검사
  → laspy 헤더 검사 및 제한된 점군 미리보기 (현재 구현)
  → PDAL info/metadata 추출
  → CRS / vertical datum 확인 (불명확하면 사용자 확인 대기)
  → 원본 보존 및 체크섬 기록
  → PDAL 필터링·좌표 변환(필요한 경우)
  → Cesium 호환 3D Tiles 변환기 검증
  → 타일 서비스 게시
  → 검증된 좌표의 경우 CesiumJS에서 로드/색상/선택/측정
  → GIS 정비 객체와 중첩
```

- `LAS`는 점군 파일 형식, `LAZ`는 압축 형식.
- `COPC`는 공간 인덱싱된 LAZ 계열이며 Cesium 3D Tiles와 다르다.
- **PDAL 자체가 곧바로 모든 Cesium 호환 3D Tiles를 생성한다고 가정하지 말 것.** 변환기를 별도로 선정하고 샘플 데이터로 검증한다.
- 정표고/타원체고, 지오이드 모델, 수평좌표계(EPSG), 축 순서, 단위를 별도 확인한다.
- LAS 업로드 후 GIS 정비는 원본 점을 수정하는 것이 아니라 별도 GIS 피처를 수정하는 작업이다.

## 9. 브이월드 지도 연동 점검

현재 프런트엔드는 CesiumJS에 VWorld WMTS 배경지도를 로드하고, 위치 선택 팝업에서도 같은 레이어를 사용한다. 공식 VWorld 3D 건물/지형 API 연동은 아직 아니다. 지도 타일 요청 실패는 키 권한·허용 도메인·네트워크 상태와 함께 확인한다.

확인할 사항:
1. 키 유효성, 허용 도메인(origin), 요청량 제한.
2. 사용 가능한 WMTS 레이어명, 타일행/열/레벨 규칙, HTTPS/CORS.
3. Cesium `WebMapTileServiceImageryProvider` 설정 호환성.
4. 영상지도와 지형·3D 건물 서비스는 별도 취급.
5. 폐쇄망에서 브이월드 외부 호출이 차단되는 경우 내부 반입 가능한 지도 데이터/타일 서비스가 필요하며 이용약관·재배포/캐싱 허용 여부를 확인.

## 10. Codex 우선 점검/수정 항목

### P0 — 실제 실행 검증
- `docker compose config`, `docker compose up -d --build` 성공 확인.
- DB 준비 후 API 시작, `/api/health`, `/api/features` 정상 응답.
- `npm install`, `npm run build`, `npm run dev` 실행.
- Vite proxy와 Cesium 정적 자산이 실제 동작하는지 확인.
- 브라우저 개발자도구 Console/Network 오류 기록.
- 키 없이 기본 지구본이 뜨는지, 키를 넣었을 때 WMTS가 뜨는지 각각 테스트.

### P1 — 기존 구현의 품질/보안 문제
- 현재 GeoJSON 검증은 구조 검사가 약함: 좌표 유효성, 도형 유효성, 범위 및 CRS 검증 강화.
- LAS 업로드는 `LASF` 매직바이트만 검사: 압축/헤더 무결성, 0바이트, 저장 용량, 악성 업로드 처리 보강.
- 동기 업로드는 1 GiB에서 지연 가능: 추후 청크/재시도/비동기 처리 도입.
- DB/파일 동시 작업 실패 시 고아 파일·고아 메타데이터 방지.
- 기본 DB 암호 교체, CORS 제한, 업로드 접근권한, 로그 민감정보 제거.
- `/api/health`가 DB 연결까지 검증하는지 구분해 readiness endpoint 추가 고려.
- GIS 피처 API는 유지하지만 편집 UI는 노출하지 않음. 추후 GIS 레이어를 추가할 때 레이어 관리 화면과 연결.
- 자동 테스트와 API 에러 처리, `.gitignore`, `.env.example` 문서화.

### P2 — 개발 편의성 및 폐쇄망 대비
- `.env` 분리, Docker 이미지·npm/pip 의존성 버전 고정.
- CI 없이도 실행 가능한 테스트 스크립트 작성.
- 배포용 정적 빌드/Nginx 및 오프라인 자산 로딩 검토.
- Docker 이미지 `save/load`, npm/pip 오프라인 패키지, 취약점 스캔/SBOM 준비.
- Oracle SDE 연계는 향후 별도 읽기/동기화 모듈로 분리; 초기 원본 DB 직접 수정 금지.

## 11. 검증 체크리스트

- [x] Docker Compose DB/API 컨테이너 정상 기동
- [x] `/api/health` 응답
- [x] PostGIS 초기화 및 API 기동
- [ ] GIS Point 생성 → 조회 → 수정 → 재조회
- [x] React/Vite 빌드 성공
- [x] Cesium 지구본과 지도 위치 선택 팝업 렌더링
- [x] VWorld WMTS 일부 타일 표시 확인 (API 키/허용 도메인 운영 검증은 별도)
- [x] LAS 샘플 업로드, laspy 헤더 검사 및 목록 조회
- [x] LAS 점군 미리보기 API와 브라우저 팝업 확인
- [ ] 유효하지 않은 파일/대용량 파일 오류 처리 확인
- [x] `README.md` 및 개발 가이드 기능/제약 최신화
- [ ] Phase 2 이슈 목록 작성

## 12. Phase 2 후속 작업 프롬프트 (복사하여 사용)

```text
현재 Phase 1 기능과 Phase 2 미리보기(위치 선택 지도 팝업, LAS 로컬 점군 팝업)를 보존하며 후속 기능을 개발하라.
1) LAS 좌표계·수직 기준 검증 없이 좌표 변환이나 VWorld 오버레이를 수행하지 않는다.
2) PDAL/3D Tiles 변환기를 도입할 경우 샘플 데이터와 라이선스를 확인하고 비동기 처리를 고려한다.
3) VWorld WMTS와 공식 VWorld 3D 건물·지형 서비스를 구분한다.
4) 기존 GIS 편집 기능과 업로드 원본을 수정하지 말고, 변경사항에 맞는 테스트를 추가한다.
5) Docker/API, 프런트엔드 빌드, 브라우저 기능을 실제 검증하고 결과와 남은 제약을 보고한다.
```

## 13. 다음 단계에서 사용자에게 확인할 정보

1. 개발 PC에 Docker Desktop/WSL2가 실제로 설치되어 있는가?
2. VWorld WMTS 키를 발급받았고 localhost 개발용 허용 설정이 가능한가?
3. 실제 LAS/LAZ 샘플 파일의 크기, 수평 좌표계(EPSG), 수직 기준을 확인할 수 있는가?

---

**인수인계 원칙:** Phase 1을 검증한 후에만 Phase 2(PDAL Worker + 3D Tiles + Cesium 점군 시각화)로 진행한다.
