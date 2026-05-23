// PM2 process config for the RoofOps API.
// The API is launched via /usr/local/bin/roofops-api, which sources
// /etc/roofops/api.env so secrets are never present in this file.

module.exports = {
  apps: [
    {
      name: 'roofops-api',
      script: '/usr/local/bin/roofops-api',
      interpreter: 'bash',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '15s',
      kill_timeout: 10_000,
      max_memory_restart: '512M',
      time: true,
      out_file: '/home/roofops/logs/api.out.log',
      error_file: '/home/roofops/logs/api.err.log',
      merge_logs: true,
    },
  ],
};
