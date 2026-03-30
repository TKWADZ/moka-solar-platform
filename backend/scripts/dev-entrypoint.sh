#!/bin/sh
set -eu

npx prisma generate

until npx prisma migrate deploy; do
  echo "Waiting for database..."
  sleep 3
done

if node <<'NODE'
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const roleCount = await prisma.role.count();
  process.exit(roleCount > 0 ? 0 : 1);
}

main()
  .catch(() => process.exit(1))
  .finally(async () => {
    await prisma.$disconnect();
  });
NODE
then
  echo "Skipping seed because base data already exists."
else
  echo "Seeding database..."
  npm run prisma:seed
fi

npm run start:dev
