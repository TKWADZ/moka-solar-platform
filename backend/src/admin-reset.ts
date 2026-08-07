import './common/helpers/bootstrap-env';
import * as bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { assertPasswordPolicy } from './common/auth/password-policy';
import { hasCliFlag, promptHidden, readCliOption } from './common/cli/interactive-prompt';
import { isValidEmail, normalizeEmail } from './common/helpers/identity.helper';

const prisma = new PrismaClient();
const INTERNAL_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF']);

async function main() {
  const email = normalizeEmail(readCliOption('email'));
  const activate = hasCliFlag('activate');

  if (!email || !isValidEmail(email)) {
    throw new Error('Usage: npm run admin:reset-password -- --email user@example.com [--activate]');
  }

  const matches = await prisma.user.findMany({
    where: { email: { equals: email, mode: 'insensitive' } },
    include: { role: true },
    take: 2,
  });

  if (matches.length !== 1 || !INTERNAL_ROLES.has(matches[0].role.code)) {
    throw new Error('Internal account was not found or is ambiguous. No changes were made.');
  }

  const user = matches[0];
  if (user.deletedAt && !activate) {
    throw new Error('Account is inactive. Re-run with --activate only after authorization.');
  }

  const password = await promptHidden('New password');
  const confirmation = await promptHidden('Confirm new password');
  if (password !== confirmation) {
    throw new Error('Password confirmation does not match.');
  }
  assertPasswordPolicy(password);

  const passwordHash = await bcrypt.hash(password, 12);
  const now = new Date();

  await prisma.$transaction(async (transaction) => {
    await transaction.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        refreshToken: null,
        failedPasswordLoginCount: 0,
        lockedUntil: null,
        ...(activate ? { deletedAt: null } : {}),
      },
    });

    await transaction.authSession.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: now, revokedReason: 'SERVER_CLI_PASSWORD_RESET' },
    });

    await transaction.staffPasswordResetToken.updateMany({
      where: { userId: user.id, usedAt: null, revokedAt: null },
      data: { revokedAt: now },
    });

    await transaction.auditLog.create({
      data: {
        userId: user.id,
        action: 'STAFF_PASSWORD_RESET_BY_CLI',
        moduleKey: 'security',
        entityType: 'User',
        entityId: user.id,
        payload: {
          targetUserId: user.id,
          targetEmail: email,
          source: 'server_cli',
          activated: Boolean(activate),
          sessionsRevoked: true,
        },
      },
    });
  });

  process.stdout.write(`Password reset completed for ${email}. Existing sessions were revoked.\n`);
}

main()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Password reset failed.'}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
