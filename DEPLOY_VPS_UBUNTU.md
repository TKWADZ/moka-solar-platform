# Deploy Moka Solar lên VPS Ubuntu

## 1. Yêu cầu máy chủ

- Ubuntu 22.04 LTS hoặc mới hơn
- Node.js 20 LTS
- npm 10+
- PostgreSQL 16
- PM2
- Nginx
- Git

## 2. Clone source từ GitHub

```bash
git clone <GITHUB_REPO_URL> moka-solar-platform
cd moka-solar-platform
```

## 3. Tạo file `.env`

```bash
cp .env.production.example .env
nano .env
```

Các biến tối thiểu cần có trên VPS:

- `DATABASE_URL`
- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `JWT_SECRET`
- `CORS_ORIGIN`
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_API_BASE_URL=/api`
- `NEXT_PUBLIC_API_URL=/api`
- `BOOTSTRAP_SUPERADMIN_EMAIL`
- `BOOTSTRAP_SUPERADMIN_PASSWORD`
- `BOOTSTRAP_SUPERADMIN_NAME`
- `MEDIA_STORAGE_DIR=storage/media`

Biến tùy chọn:

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_WEBSITE_MODEL`
- `WEBSITE_AI_CHAT_ENABLED`
- `SEMS_*`
- `DEYE_*`
- `SOLARMAN_*`

## 4. Cài dependencies và build

```bash
cd backend
npm install
npx prisma generate
npx prisma migrate deploy
npm run build

cd ../frontend
npm install
npm run build
```

## 5. Chạy bằng PM2

Tại root project:

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

Kiểm tra:

```bash
pm2 status
pm2 logs moka-solar-backend
pm2 logs moka-solar-frontend
```

## 6. Reverse proxy Nginx

Sample config có sẵn tại:

- `deploy/nginx/moka-solar.pm2.conf.example`

Ý tưởng route:

- `/` -> frontend `127.0.0.1:3000`
- `/api/` -> backend `127.0.0.1:4000`

Sau khi đặt config:

```bash
sudo ln -s /path/to/moka-solar-platform/deploy/nginx/moka-solar.pm2.conf.example /etc/nginx/sites-available/moka-solar
sudo ln -s /etc/nginx/sites-available/moka-solar /etc/nginx/sites-enabled/moka-solar
sudo nginx -t
sudo systemctl reload nginx
```

## 7. Update sau này

```bash
git pull origin main

cd backend
npm install
npx prisma generate
npx prisma migrate deploy
npm run build

cd ../frontend
npm install
npm run build

cd ..
pm2 restart moka-solar-backend
pm2 restart moka-solar-frontend
```

## 8. Nếu sau này muốn tách native app

- giữ nguyên backend REST hiện tại
- tái sử dụng auth flow
- tái sử dụng customer portal data model
- thay frontend customer bằng Expo / React Native khi cần
