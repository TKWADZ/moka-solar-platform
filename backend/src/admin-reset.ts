import './common/helpers/bootstrap-env';
import * as bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import {
  normalizeEmail,
  normalizeVietnamPhone,
} from './common/helpers/identity.helper';

const prisma = new PrismaClient();

function readEnv(name: string) {
  return process.env[name]?.trim();
}

async function main() {
  const email = normalizeEmail(readEnv('BOOTSTRAP_ADMIN_EMAIL') || 'admin@mokasolar.com');
  const phone = normalizeVietnamPhone(readEnv('BOOTSTRAP_ADMIN_PHONE'));
  const password = readEnv('BOOTSTRAP_ADMIN_PASSWORD') || '123456';
  const fullName = readEnv('BOOTSTRAP_ADMIN_NAME') || 'Moka Operations Admin';

  const adminRole = await prisma.role.upsert({
    where: { code: 'ADMIN' },
    update: { name: 'Admin' },
    create: { code: 'ADMIN', name: 'Admin' },
  });

  const passwordHash = await bcrypt.hash(password, 10);

  const existingUser =
    (email
      ? await prisma.user.findUnique({
          where: { email },
        })
      : null) ||
    (phone
      ? await prisma.user.findUnique({
          where: { phone },
        })
      : null);

  const user = existingUser
    ? await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          email,
          phone,
          phoneVerifiedAt: phone ? new Date() : null,
          fullName,
          passwordHash,
          roleId: adminRole.id,
          deletedAt: null,
        },
        include: {
          role: true,
        },
      })
    : await prisma.user.create({
        data: {
          email,
          phone,
          phoneVerifiedAt: phone ? new Date() : null,
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
        phone: user.phone,
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
