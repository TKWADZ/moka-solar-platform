import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../src/auth/auth.service';
import { StaffPasswordService } from '../src/auth/staff-password.service';
import { StaffMailProvider, StaffPasswordResetMail } from '../src/auth/mail/staff-mail-provider.interface';
import { OtpProvider } from '../src/auth/otp/otp-provider.interface';
import { PrismaService } from '../src/prisma/prisma.service';
import { RequestContextService } from '../src/common/request-context/request-context.service';

class CapturingMailProvider implements StaffMailProvider {
  messages: StaffPasswordResetMail[] = [];
  async sendPasswordReset(message: StaffPasswordResetMail) {
    this.messages.push(message);
  }
}

const disabled = !process.env.TEST_DATABASE_URL;

test('staff recovery, login and customer auth regression flow', { skip: disabled }, async () => {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.APP_PUBLIC_URL = 'https://example.test';
  process.env.JWT_SECRET = 'integration-test-only-secret';
  process.env.STAFF_PASSWORD_RESET_REQUEST_MAX_PER_HOUR = '5';

  const prisma = new PrismaService();
  await prisma.$connect();
  const requestContext = new RequestContextService();
  const mail = new CapturingMailProvider();
  const otpPurposes: string[] = [];
  const otpProvider: OtpProvider = {
    name: 'TEST',
    async sendOtp(params) {
      otpPurposes.push(params.purpose);
      return {
        success: true,
        provider: 'TEST',
        channel: 'ZALO',
        sendStatus: 'DRY_RUN',
        providerMessage: 'Sanitized integration test delivery.',
      };
    },
  };
  const auth = new AuthService(
    prisma,
    new JwtService({ secret: process.env.JWT_SECRET }),
    requestContext,
    otpProvider,
  );
  const staffPasswords = new StaffPasswordService(prisma, requestContext, mail);

  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const staffEmail = `staff-${suffix}@example.test`;
  const missingEmail = `missing-${suffix}@example.test`;
  const customerPhone = `849${String(Date.now()).slice(-8)}`;
  const oldPassword = 'old staff passphrase 2026';
  const resetPassword = 'reset staff passphrase 2026';
  const changedPassword = 'changed staff passphrase 2026';
  const customerPassword = 'customer passphrase 2026';

  const [staffRole, customerRole] = await Promise.all([
    prisma.role.upsert({
      where: { code: 'STAFF' },
      update: {},
      create: { code: 'STAFF', name: 'Staff' },
    }),
    prisma.role.upsert({
      where: { code: 'CUSTOMER' },
      update: {},
      create: { code: 'CUSTOMER', name: 'Customer' },
    }),
  ]);

  const staff = await prisma.user.create({
    data: {
      email: staffEmail,
      fullName: 'Staff Auth Fixture',
      passwordHash: await bcrypt.hash(oldPassword, 10),
      roleId: staffRole.id,
    },
  });
  const customer = await prisma.user.create({
    data: {
      phone: customerPhone,
      fullName: 'Customer Auth Fixture',
      passwordHash: await bcrypt.hash(customerPassword, 10),
      roleId: customerRole.id,
      customer: { create: { customerCode: `TEST-${suffix}` } },
    },
  });

  try {
    const validLogin = await auth.login({
      identifier: `  ${staffEmail.toUpperCase()}  `,
      password: oldPassword,
    });
    assert.equal(validLogin.user.role, 'STAFF');

    await prisma.user.update({
      where: { id: staff.id },
      data: { lockedUntil: new Date(Date.now() + 60_000) },
    });
    await assert.rejects(
      () => auth.login({ identifier: staffEmail, password: oldPassword }),
      (error: any) => error.status === 423,
    );
    await prisma.user.update({ where: { id: staff.id }, data: { lockedUntil: null } });

    await prisma.user.update({ where: { id: staff.id }, data: { deletedAt: new Date() } });
    await assert.rejects(
      () => auth.login({ identifier: staffEmail, password: oldPassword }),
      (error: any) => error.message === 'Email or password is incorrect.',
    );
    await prisma.user.update({ where: { id: staff.id }, data: { deletedAt: null } });

    let wrongMessage = '';
    await assert.rejects(
      () => auth.login({ identifier: staffEmail, password: 'incorrect password value' }),
      (error: any) => {
        wrongMessage = error.message;
        return true;
      },
    );
    let missingMessage = '';
    await assert.rejects(
      () => auth.login({ identifier: missingEmail, password: 'incorrect password value' }),
      (error: any) => {
        missingMessage = error.message;
        return true;
      },
    );
    assert.equal(wrongMessage, 'Email or password is incorrect.');
    assert.equal(missingMessage, wrongMessage);

    const existingResponse = await staffPasswords.requestPasswordReset(` ${staffEmail.toUpperCase()} `);
    const missingResponse = await staffPasswords.requestPasswordReset(missingEmail);
    assert.deepEqual(missingResponse, existingResponse);
    assert.equal(mail.messages.length, 1);

    const rawToken = new URL(mail.messages[0].resetUrl).searchParams.get('token');
    assert.ok(rawToken);
    const storedToken = await prisma.staffPasswordResetToken.findFirstOrThrow({
      where: { userId: staff.id },
    });
    assert.notEqual(storedToken.tokenHash, rawToken);
    assert.equal(storedToken.tokenHash.length, 64);

    const sessionBeforeReset = await prisma.authSession.findFirstOrThrow({
      where: { userId: staff.id, revokedAt: null },
    });
    await staffPasswords.resetPassword({
      token: rawToken!,
      newPassword: resetPassword,
      confirmPassword: resetPassword,
    });
    assert.equal(
      (await prisma.authSession.findUniqueOrThrow({ where: { id: sessionBeforeReset.id } })).revokedReason,
      'STAFF_PASSWORD_RESET',
    );
    await assert.rejects(() => auth.login({ identifier: staffEmail, password: oldPassword }));
    assert.equal((await auth.login({ identifier: staffEmail, password: resetPassword })).user.role, 'STAFF');
    let usedTokenMessage = '';
    await assert.rejects(
      () => staffPasswords.resetPassword({
        token: rawToken!,
        newPassword: changedPassword,
        confirmPassword: changedPassword,
      }),
      (error: any) => {
        usedTokenMessage = error.message;
        return true;
      },
    );

    await staffPasswords.requestPasswordReset(staffEmail);
    const expiringToken = new URL(mail.messages.at(-1)!.resetUrl).searchParams.get('token')!;
    await prisma.staffPasswordResetToken.updateMany({
      where: { userId: staff.id, usedAt: null, revokedAt: null },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    let expiredTokenMessage = '';
    await assert.rejects(
      () => staffPasswords.resetPassword({
        token: expiringToken,
        newPassword: changedPassword,
        confirmPassword: changedPassword,
      }),
      (error: any) => {
        expiredTokenMessage = error.message;
        return true;
      },
    );

    await staffPasswords.requestPasswordReset(staffEmail);
    const revokedToken = new URL(mail.messages.at(-1)!.resetUrl).searchParams.get('token')!;
    await prisma.staffPasswordResetToken.updateMany({
      where: { userId: staff.id, usedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    let revokedTokenMessage = '';
    await assert.rejects(
      () => staffPasswords.resetPassword({
        token: revokedToken,
        newPassword: changedPassword,
        confirmPassword: changedPassword,
      }),
      (error: any) => {
        revokedTokenMessage = error.message;
        return true;
      },
    );
    assert.equal(expiredTokenMessage, usedTokenMessage);
    assert.equal(revokedTokenMessage, usedTokenMessage);

    await assert.rejects(() =>
      staffPasswords.changePassword({
        userId: staff.id,
        currentPassword: 'wrong current password',
        newPassword: changedPassword,
        confirmPassword: changedPassword,
      }),
    );
    await staffPasswords.changePassword({
      userId: staff.id,
      currentPassword: resetPassword,
      newPassword: changedPassword,
      confirmPassword: changedPassword,
    });
    assert.equal((await auth.login({ identifier: staffEmail, password: changedPassword })).user.role, 'STAFF');

    const customerLogin = await auth.login({ identifier: customerPhone, password: customerPassword });
    assert.equal(customerLogin.user.role, 'CUSTOMER');
    assert.equal(customerLogin.user.customerId != null, true);
    const customerOtpRequest = await auth.requestLoginOtp({ phone: customerPhone });
    assert.ok(customerOtpRequest.requestId);
    assert.equal(otpPurposes.at(-1), 'CUSTOMER_SENSITIVE_ACTION');

    const auditPayloads = await prisma.auditLog.findMany({
      where: { userId: staff.id },
      select: { payload: true },
    });
    assert.equal(JSON.stringify(auditPayloads).includes(rawToken!), false);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: staff.id }, include: { role: true } })).role.code, 'STAFF');

    const limitedEmail = `limited-${suffix}@example.test`;
    await prisma.authLoginAttempt.createMany({
      data: Array.from({ length: 5 }, () => ({
        authMethod: 'STAFF_PASSWORD_RESET_REQUEST',
        identifierType: 'EMAIL',
        identifierValue: limitedEmail,
        success: true,
        outcome: 'GENERIC_ACCEPTED',
      })),
    });
    await assert.rejects(() => staffPasswords.requestPasswordReset(limitedEmail));
  } finally {
    await prisma.auditLog.deleteMany({ where: { userId: { in: [staff.id, customer.id] } } });
    await prisma.authSession.deleteMany({ where: { userId: { in: [staff.id, customer.id] } } });
    await prisma.otpRequest.deleteMany({ where: { userId: { in: [staff.id, customer.id] } } });
    await prisma.authLoginAttempt.deleteMany({
      where: {
        OR: [
          { userId: { in: [staff.id, customer.id] } },
          { identifierValue: { contains: suffix } },
        ],
      },
    });
    await prisma.staffPasswordResetToken.deleteMany({ where: { userId: staff.id } });
    await prisma.customer.deleteMany({ where: { userId: customer.id } });
    await prisma.user.deleteMany({ where: { id: { in: [staff.id, customer.id] } } });
    await prisma.$disconnect();
  }
});
