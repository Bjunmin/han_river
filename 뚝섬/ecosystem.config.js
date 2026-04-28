/**
 * PM2 ecosystem file for Han-River AIS server.
 *
 * Goals (24/7 two-PC deployment at 여의도 + 뚝섬):
 *  - Node process survives crashes: autorestart + unlimited restarts w/ exponential backoff
 *  - Cap memory to avoid runaway leak killing the OS (NestJS heap > 600MB → restart)
 *  - Keep log files bounded via Winston (see src/common/logger/logger.config.ts).
 *    PM2 stdout/stderr also rotated by pm2-logrotate (install separately).
 *  - SITE_MODE is driven by .env (dotenv via ConfigModule) — we DO NOT hardcode site here
 *    so the same ecosystem file works on both PCs.
 */
module.exports = {
  apps: [
    {
      name: 'ais-edge',
      script: 'dist/main.js',
      cwd: __dirname,

      // --- Execution model ---
      instances: 1,              // 단일 인스턴스 (serial port 공유 불가)
      exec_mode: 'fork',
      node_args: '--enable-source-maps',

      // --- Restart policy ---
      autorestart: true,
      watch: false,
      // 무한 재시작 허용 (24/7 가동). PM2 가 'max_restarts' 초과 시 stopped 가 되면 복구 못 함.
      max_restarts: 0,           // 0 = unlimited
      min_uptime: '30s',         // 30초 이상 떠있어야 정상 기동으로 간주
      restart_delay: 3000,       // 재시작 전 기본 3초 대기
      exp_backoff_restart_delay: 5000, // 연속 crash 시 exponential backoff (5,10,20,40...s)

      // --- Memory guard ---
      // NestJS + typeorm + decoder 정상 동작 시 rss ~200-400MB.
      // 600MB 이상이면 leak 의심 → 강제 재시작.
      max_memory_restart: '600M',

      // --- 환경변수 (.env 는 ConfigModule 이 로드. 여기서는 최소만 강제) ---
      env: {
        NODE_ENV: 'production',
        TZ: 'Asia/Seoul',
      },

      // --- PM2 자체 로그 (Winston 이 app 로그는 따로 파일로 기록) ---
      out_file: 'logs/pm2-out.log',
      error_file: 'logs/pm2-error.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss.SSS',

      // --- Graceful shutdown ---
      // main.ts 에서 SIGTERM/SIGINT 핸들러로 app.close() 호출.
      kill_timeout: 15_000,      // 15초 내 shutdown 못 끝내면 SIGKILL
      wait_ready: false,         // Nest 는 process.send('ready') 를 보내지 않음
      listen_timeout: 30_000,
    },
  ],
};
