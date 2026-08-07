import './common/helpers/bootstrap-env';
import * as bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { assertPasswordPolicy } from './common/auth/password-policy';
import { promptHidden, promptText, readCliOption } from './common/cli/interactive-prompt';
import { isValidEmail, normalizeEmail } from './common/helpers/identity.helper';

const prisma = new PrismaClient();
const INTERNAL_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF'];

async function main() {
  const internalCount = await prisma.user.count({
    where: { role: { is: { code: { in: INTERNAL_ROLES } } } },
  });
  if (internalCount > 0) {
    throw new Error('An internal account already exists. Use admin:reset-password instead.');
  }

  const email = normalizeEmail(readCliOption('email'));
  if (!email || !isValidEmail(email)) {
    throw new Error('Usage: npm run admin:create-first -- --email owner@example.com');
  }

  const fullName = (await promptText('Full name')).trim();
  if (!fullName) throw new Error('Full name is required.');

  const password = await promptHidden('New password');
  const confirmation = await promptHidden('Confirm new password');
  if (password !== confirmation) throw new Error('Password confirmation does not match.');
  assertPasswordPolicy(password);

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.$transaction(async (transaction) => {
    const role = await transaction.role.upsert({
      where: { code: 'SUPER_ADMIN' },
      update: { name: 'Super Admin' },
      create: { code: 'SUPER_ADMIN', name: 'Super Admin' },
    });
    const user = await transaction.user.create({
      data: { email, fullName, passwordHash, roleId: role.id },
    });
    await transaction.auditLog.create({
      data: {
        userId: user.id,
        action: 'FIRST_SUPER_ADMIN_CREATED_BY_CLI',
        moduleKey: 'security',
        entityType: 'User',
        entityId: user.id,
        payload: { targetUserId: user.id, targetEmail: email, source: 'server_cli' },
      },
    });
  });

  process.stdout.write(`First Super Admin account created for ${email}.\n`);
}

main()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Bootstrap failed.'}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
