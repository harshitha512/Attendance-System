module.exports = {
  apps: [
    {
      name: "attendance-backend",
      script: "backend/src/index.js",
      interpreter: "node",
      cwd: "./",
      instances: 1,
      exec_mode: "fork",
      watch: false,
      env: {
        NODE_ENV: "production",
        PORT: 5000,
        DB_HOST: "localhost",
        DB_PORT: 5432,
        DB_NAME: "attendance_db",
        DB_USER: "postgres",
        DB_PASSWORD: "postgres123",
        JWT_SECRET: "myjwtsecret",
        JWT_EXPIRES_IN: "8h",
        FACE_SERVICE_URL: "http://localhost:8000",
        CORS_ORIGIN: "*"
      },
      error_file: "logs/backend-error.log",
      out_file: "logs/backend-output.log",
      max_restarts: 10,
      kill_timeout: 5000
    },
    {
      name: "attendance-frontend",
      script: "node_modules/vite/bin/vite.js",
      interpreter: "node",
      args: "--host 0.0.0.0 --port 3000",
      cwd: "C:\\Project\\attendance\\attendance-system\\frontend",
      instances: 1,
      exec_mode: "fork",
      watch: false,
      env: {
        NODE_ENV: "development",
        VITE_API_URL: "http://localhost:5000",
        VITE_FACE_SERVICE_URL: "http://localhost:8000"
      },
      error_file: "logs/frontend-error.log",
      out_file: "logs/frontend-output.log",
      max_restarts: 10,
      kill_timeout: 5000
    },
    {
      name: "attendance-face-service",
      script: "face-service/main.py",
      interpreter: "python",
      cwd: "./",
      instances: 1,
      exec_mode: "fork",
      watch: false,
      env: {
        PYTHONUNBUFFERED: "1",
        HOST: "0.0.0.0",
        PORT: 8000,
        DB_HOST: "localhost",
        DB_PORT: 5432,
        DB_NAME: "attendance_db",
        DB_USER: "postgres",
        DB_PASSWORD: "postgres123",
        TOLERANCE: "0.5"
      },
      error_file: "logs/face-service-error.log",
      out_file: "logs/face-service-output.log",
      max_restarts: 10,
      kill_timeout: 5000
    }
  ]
};