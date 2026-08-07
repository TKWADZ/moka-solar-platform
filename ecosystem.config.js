module.exports = {
  apps: [
    {
      name: 'moka-solar-backend',
      cwd: './backend',
      script: 'npm',
      args: 'run start',
      env: {
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: 4000,
      },
    },
    {
      name: 'moka-solar-frontend',
      cwd: './frontend',
      script: 'npm',
      args: 'run start',
      env: {
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: 3000,
      },
    },
  ],
};
