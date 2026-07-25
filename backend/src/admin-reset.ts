import './common/helpers/bootstrap-env';
import * as bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import {
  isValidEmail,
  normalizeEmail,
  normalizeVietnamPhone,
} from './common/helpers/identity.helper';

const prisma = new PrismaClient();

function readEnv(name: string) {
  return process.env[name]?.trim();
}

function requireEnv(name: string) {
  const value = readEnv(name);

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

function validateAdminPassword(password: string) {
  const knownWeakPasswords = new Set([
    '123456',
    'admin',
    'changeme',
    'password',
  ]);

  if (password.length < 16 || knownWeakPasswords.has(password.toLowerCase())) {
    throw new Error(
      'BOOTSTRAP_ADMIN_PASSWORD must be at least 16 characters and must not be a known default.',
    );
  }
}

async function main() {
  const email = normalizeEmail(requireEnv('BOOTSTRAP_ADMIN_EMAIL'));
  const phone = normalizeVietnamPhone(readEnv('BOOTSTRAP_ADMIN_PHONE'));
  const password = requireEnv('BOOTSTRAP_ADMIN_PASSWORD');
  const fullName = readEnv('BOOTSTRAP_ADMIN_NAME') || 'Moka Operations Admin';

  if (!isValidEmail(email)) {
    throw new Error('BOOTSTRAP_ADMIN_EMAIL must be a valid email address.');
  }

  validateAdminPassword(password);
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

  const now = new Date();
  const user = await prisma.$transaction(async (transaction) => {
    const adminRole = await transaction.role.upsert({
      where: { code: 'ADMIN' },
      update: { name: 'Admin' },
      create: { code: 'ADMIN', name: 'Admin' },
    });

    const updatedUser = existingUser
      ? await transaction.user.update({
          where: { id: existingUser.id },
          data: {
            email,
            phone,
            phoneVerifiedAt: phone ? now : null,
            fullName,
            passwordHash,
            roleId: adminRole.id,
            refreshToken: null,
            failedPasswordLoginCount: 0,
            lockedUntil: null,
            deletedAt: null,
          },
          include: {
            role: true,
          },
        })
      : await transaction.user.create({
          data: {
            email,
            phone,
            phoneVerifiedAt: phone ? now : null,
            fullName,
            passwordHash,
            roleId: adminRole.id,
          },
          include: {
            role: true,
          },
        });

    await transaction.authSession.updateMany({
      where: {
        userId: updatedUser.id,
        revokedAt: null,
      },
      data: {
        revokedAt: now,
        revokedReason: 'ADMIN_PASSWORD_RESET',
      },
    });

    return updatedUser;
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
