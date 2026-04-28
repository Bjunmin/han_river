module.exports = {
  apps: [
    {
      name: 'ais-client',
      script: 'node_modules/serve/build/main.js',
      args: '-s dist -l 8080',
      cwd: __dirname,

      instances: 1,
      exec_mode: 'fork',

      autorestart: true,
      watch: false,
      max_restarts: 0,
      min_uptime: '30s',
      restart_delay: 3000,
      exp_backoff_restart_delay: 5000,

      max_memory_restart: '200M',

      env: {
        NODE_ENV: 'production',
      },

      out_file: 'logs/pm2-out.log',
      error_file: 'logs/pm2-error.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss.SSS',

      kill_timeout: 5_000,
    },
  ],
};