import './common/helpers/bootstrap-env';
import * as bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function readEnv(name: string) {
  return process.env[name]?.trim();
}

async function main() {
  const email = (readEnv('BOOTSTRAP_ADMIN_EMAIL') || 'admin@mokasolar.com').toLowerCase();
  const password = readEnv('BOOTSTRAP_ADMIN_PASSWORD') || '123456';
  const fullName = readEnv('BOOTSTRAP_ADMIN_NAME') || 'Moka Operations Admin';

  const adminRole = await prisma.role.upsert({
    where: { code: 'ADMIN' },
    update: { name: 'Admin' },
    create: { code: 'ADMIN', name: 'Admin' },
  });

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      fullName,
      passwordHash,
      roleId: adminRole.id,
      deletedAt: null,
    },
    create: {
      email,
      fullName,
      passwordHash,
      roleId: adminRole.id,
    },
    include: {
      role: true,
    },
  });

  console.log(
    JSON.stringify(
      {
        email: user.email,
        fullName: user.fullName,
        role: user.role.code,
        reset: true,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
