module.exports = {
  apps: [
    {
      name: 'ameet-server',
      script: 'src/server.js',
      cwd: '/home/ubuntu/ameet/server',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
    },
  ],
};
