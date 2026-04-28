// -------------------------------------------------------------------------
// 환경 변수 키 (.env 파일의 KEY 이름들)
// 값 자체는 런타임에 configService.get(envVariableKeys.xxx) 로 읽는다
// -------------------------------------------------------------------------
const env = 'ENV';
const port = 'PORT';
const wsPort = 'WS_PORT';

// --- DB ---
const dbType = 'DB_TYPE';
const dbHost = 'DB_HOST';
const dbPort = 'DB_PORT';
const dbUsername = 'DB_USERNAME';
const dbPassword = 'DB_PASSWORD';
const dbDatabase = 'DB_DATABASE';
const dbUrl = 'DB_URL';
const dbPath = 'DB_PATH';

// --- 인증 / 메일 ---
const hashRounds = 'HASH_ROUNDS';
const accessTokenSecret = 'ACCESS_TOKEN_SECRET';
const refreshTokenSecret = 'REFRESH_TOKEN_SECRET';
const smtp_account = 'SMTP_ACCOUNT';
const smtp_password = 'SMTP_PASSWORD';

// --- AIS 분산 운영 모드 ---
// SITE_MODE 값 (site-mode.const.ts 의 SiteMode 참조):
//   standalone : 한 대. 시리얼 수신 + DB 저장 + UI 제공. /ingest 없음.
//   combined   : 여의도용. 시리얼 수신 + /ingest 수신(뚝섬) + DB 저장 + UI 제공.
//   central    : 중앙 전용. 시리얼 없음, /ingest 만 수신, DB 저장, UI 제공.
//   edge       : 뚝섬용. 시리얼 수신 후 CENTRAL_WS_URL 로 push. DB/UI 없음.
const siteMode = 'SITE_MODE';
const siteName = 'SITE_NAME';                 // 예: '여의도', '뚝섬'
const centralWsUrl = 'CENTRAL_WS_URL';        // edge 모드에서만. 예: ws://192.168.0.10:7400/ingest

// --- 로깅 / 유지보수 ---
const logDir = 'LOG_DIR';                     // default: logs/
const logRetentionDays = 'LOG_RETENTION_DAYS';// default: 30
const historyRetentionDays = 'HISTORY_RETENTION_DAYS'; // AISHistory TTL. default: 14
const dbSizeWarnMB = 'DB_SIZE_WARN_MB';       // default: 500

// --- 재연결 튜닝 (대부분 기본값 유지) ---
const serialDroughtMs = 'SERIAL_DROUGHT_MS';  // default: 120000 (2분)
const dedupWindowMs = 'DEDUP_WINDOW_MS';      // default: 3000

export const envVariableKeys = {
    env,
    port,
    wsPort,
    dbType,
    dbHost,
    dbPort,
    dbUsername,
    dbPassword,
    dbDatabase,
    dbUrl,
    dbPath,
    hashRounds,
    accessTokenSecret,
    refreshTokenSecret,
    smtp_account,
    smtp_password,
    siteMode,
    siteName,
    centralWsUrl,
    logDir,
    logRetentionDays,
    historyRetentionDays,
    dbSizeWarnMB,
    serialDroughtMs,
    dedupWindowMs,
};
