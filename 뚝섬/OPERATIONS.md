# 한강 AIS 서버 — 운영 가이드

24/7 프로덕션 배포(여의도 + 뚝섬 Windows PC) 기준.

## 1. 시스템 구성

```
 ┌───────────────────────┐          ┌───────────────────────┐
 │  뚝섬 PC  (edge)      │          │  여의도 PC (combined)  │
 │  - 시리얼 AIS 수신    │  WS push │  - 시리얼 AIS 수신    │
 │  - 로컬 DB/UI 없음    │─────────▶│  - /ingest 수신(뚝섬) │
 │  - CentralClient →    │  :7410   │  - DB 저장 + UI 제공  │
 │    여의도로 outbound  │ /ingest  │  - source merge / 중복│
 └───────────────────────┘          └───────────────────────┘
```

## 2. SITE_MODE (환경변수)

`SITE_MODE` 가 각 PC 의 역할을 결정한다. 내부적으로 capability boolean 으로 전환됨.

| 모드 | 시리얼 | /ingest 수신 | DB 저장 | UI | 중앙 push | 비고 |
| --- | --- | --- | --- | --- | --- | --- |
| `standalone` | ✅ | ❌ | ✅ | ✅ | ❌ | 1대 단독 운용 |
| `combined`   | ✅ | ✅ | ✅ | ✅ | ❌ | **여의도 PC 권장** |
| `central`    | ❌ | ✅ | ✅ | ✅ | ❌ | 중앙 전용 (시리얼 없는 별도 서버) |
| `edge`       | ✅ | ❌ | ❌ | ❌ | ✅ | **뚝섬 PC** |

실배포:

- 여의도 PC: `SITE_MODE=combined`, `SITE_NAME=여의도`
- 뚝섬 PC:   `SITE_MODE=edge`,     `SITE_NAME=뚝섬`, `CENTRAL_WS_URL=ws://<여의도IP>:7410/ingest`

## 3. 네트워크 / 포트

| 포트 | 프로토콜 | 용도 |
| --- | --- | --- |
| 7400 | HTTP | REST API + Nest Express (`/ais/health`, `/setting/...`) |
| 7410 | WebSocket | 게이트웨이 (`/ais` 클라이언트 UI, `/ingest` 엣지→중앙) |

여의도 방화벽: **TCP 7400 / 7410 둘 다 뚝섬에서 허용**.

## 4. 장애 복구

### 시리얼 수신
- `close` / `error` 발생 시 exp backoff [3s → 6s → 12s → 24s → 60s → 120s → 300s] 로 재오픈.
- 재연결 시도마다 `SerialPort.list()` 로 물리 존재 체크 — 없으면 `port_not_present` 경고 로그.
- **drought watchdog (15초마다)**: 열린 포트가 `SERIAL_DROUGHT_MS` (기본 120s) 이상 데이터 없으면 close → 재연결 트리거.
- 성공 시 attempt 카운터 0 으로 리셋.

### 엣지→중앙 WS
- `CentralClientService` 가 exp backoff [1s → 2s → 4s → 8s → 16s → 30s] 로 재연결.
- 30초 ping / 10초 내 pong 없으면 `terminate()` → `close` 이벤트로 재연결.
- 끊긴 구간 최대 60초 / 1000건 ring buffer — 재접속 시 flush.

### 프로세스 레벨
- `uncaughtException` / `unhandledRejection` 은 error 로그로 기록, **프로세스는 살려둔다**.
- PM2 가 `max_memory_restart: 600M` 초과 시, 또는 크래시 시 exp backoff 로 재시작.
- SIGTERM/SIGINT 시 `enableShutdownHooks` → `OnModuleDestroy` 실행.

## 5. 로그

`./logs/` 디렉토리에 Winston daily-rotate 로그.

- `app-YYYY-MM-DD.log` — 전체 레벨 (JSON)
- `error-YYYY-MM-DD.log` — error 전용
- `ais-YYYY-MM-DD.log` — AIS context 만 필터 (Ais/CentralClient/Serial/Ingest/Edge/Dedup)
- `LOG_RETENTION_DAYS` (기본 30일) 보관, 파일당 20MB, gzip 압축

PM2 stdout/stderr 는 `./logs/pm2-out.log`, `./logs/pm2-error.log`.

## 6. 설치 (Windows)

관리자 PowerShell:

```powershell
cd C:\han_river_server
powershell -ExecutionPolicy Bypass -File .\scripts\install-windows.ps1
```

스크립트가 수행:
1. `npm install` → `npm run build`
2. PM2 + pm2-windows-startup 글로벌 설치
3. .env 템플릿 복사 (없을 경우)
4. logs/, data/ 디렉토리 생성
5. `pm2 start ecosystem.config.js` → `pm2 save` → `pm2-startup install`

### 설치 (macOS / Linux)

```bash
npm install
npm run build
npm install -g pm2
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup    # 출력되는 sudo 명령을 그대로 실행
```

### 운영 명령

```bash
pm2 status
pm2 logs ais-server
pm2 restart ais-server
pm2 reload ais-server    # 무중단 재시작 (fork 모드라 사실상 restart)
pm2 monit
```

## 7. 헬스체크

```bash
curl http://localhost:7400/ais/health
```

응답 예시:

```json
{
  "mode": "combined",
  "site": "여의도",
  "capabilities": {
    "serialEnabled": true,
    "ingestEnabled": true,
    "dbEnabled": true,
    "uiEnabled": true,
    "pushToCentralEnabled": false
  },
  "communicationType": "serial",
  "deviceConnected": true,
  "serialPorts": [
    { "path": "COM3", "open": true, "lastDataAgoMs": 420, "reconnectAttempt": 0, "missCount": 0 }
  ],
  "tcp": null,
  "centralClient": { "enabled": false, ... },
  "ingest": {
    "enabled": true,
    "mode": "combined",
    "connectedEdges": [ { "site": "뚝섬", "uptimeMs": 3600000 } ]
  },
  "trackedMmsiCount": 12,
  "activeSources": 9,
  "droughtMs": 120000,
  "uptimeSec": 86400,
  "memory": { "rss": 214000000, ... }
}
```

## 8. DB 운영 (SQLite, better-sqlite3)

### PRAGMA 튜닝 (자동 적용)
- `journal_mode = WAL` — 동시성 + 크래시 복구
- `synchronous = NORMAL` — FULL 대비 ~10x, 정전 시 최근 1~2 트랜잭션 유실 허용
- `busy_timeout = 5000` — 락 경합 5초 재시도
- `cache_size = -64000` — 64MB
- `temp_store = MEMORY`
- `foreign_keys = ON`

### 정기 유지보수 (Cron)
- **매 시 정각**: `PRAGMA wal_checkpoint(PASSIVE)` — WAL 파일이 끝없이 커지지 않게
- **매일 02:30**: `AISHistory` 에서 `HISTORY_RETENTION_DAYS` (기본 14일) 초과 레코드 삭제 + `wal_checkpoint(TRUNCATE)`
- **매일 00:00**: AIS/AISHistory/AISStatic/AISDetection 에서 6개월 초과 레코드 삭제
- **일요일 03:00**: `ANALYZE` + `PRAGMA integrity_check` + DB 파일 사이즈 체크 (`DB_SIZE_WARN_MB` 초과 시 경고)

### 수동 점검

```bash
sqlite3 data/han_river.sqlite "PRAGMA integrity_check"
sqlite3 data/han_river.sqlite "SELECT COUNT(*) FROM ais_history"
sqlite3 data/han_river.sqlite "VACUUM"    # 큰 삭제 후 물리 사이즈 축소
```

## 9. 분산 수신 항적 표시

여의도·뚝섬 양쪽에서 같은 선박을 볼 수 있을 때:

- **기본**: 같은 MMSI 는 merge 해서 한 번만 표시. `AIS.lastSource` 가 가장 최근 소스.
- **source 집합**: `AIS.activeSources` = 최근 5분 내 수신한 소스 JSON 배열 (예: `["여의도","뚝섬"]`).
- **항적 (AISHistory)**: 각 포인트에 `source` 컬럼. UI 에서 여의도/뚝섬 토글 가능.
- **dedup 윈도우**: `DEDUP_WINDOW_MS` (기본 3초) 이내 같은 MMSI 재수신은 skip 하되, `activeSources` 기록은 갱신.

## 10. 장애 대응 체크리스트

| 증상 | 1차 확인 | 2차 확인 |
| --- | --- | --- |
| 선박이 안 보임 | `/ais/health` → `serialPorts[].open`, `trackedMmsiCount` | `logs/ais-*.log` 에 `Serial` / `drought_detected` 검색 |
| 중앙 서버와 안 붙음 | `/ais/health` (뚝섬) → `centralClient.connected` / `reconnectAttempt` | 여의도 PC 의 7410 포트 방화벽 |
| 뚝섬만 안 보임 (여의도에서) | 여의도 `/ais/health` → `ingest.connectedEdges` 에 뚝섬 있는지 | 뚝섬 `pm2 logs` 에 `CentralClient` 검색 |
| 메모리 증가 | `pm2 monit` | 600MB 초과 시 자동 재시작됨 — 로그에서 이유 역추적 |
| DB 사이즈 폭증 | 주간 `db_size_warning` 로그 확인 | `HISTORY_RETENTION_DAYS` 단축 or 수동 `VACUUM` |
| 디스크 부족 | `du -sh logs data` | `LOG_RETENTION_DAYS` 단축 |
| 선박은 있는데 위치 멈춤 | `/ais/health` → `serialPorts[].lastDataAgoMs` | 120s 넘으면 drought watchdog 발동 (자동 복구) |

## 11. 배포 업데이트

```bash
git pull
npm install           # package.json 변경 시
npm run build
pm2 restart ais-server
```

여의도와 뚝섬 PC 양쪽 모두 동일 절차. 순서는 여의도 먼저 (중앙) → 뚝섬. 중앙이 잠깐 끊겨도 뚝섬은 ring buffer 로 60초 보관 후 flush.
