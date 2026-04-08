import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { resolvePermissionsForRole } from '../common/auth/permissions';
import {
  isValidEmail,
  normalizeEmail,
  normalizeVietnamPhone,
} from '../common/helpers/identity.helper';

@Injectable()
export class BootstrapService implements OnModuleInit {
  private readonly logger = new Logger(BootstrapService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.ensureRoles();
    await this.normalizeLegacyUserPhones();
    await this.ensureRoleAccount({
      roleCode: 'SUPER_ADMIN',
      roleLabel: 'SUPER_ADMIN',
      email: process.env.BOOTSTRAP_SUPERADMIN_EMAIL?.trim().toLowerCase(),
      phone: process.env.BOOTSTRAP_SUPERADMIN_PHONE?.trim(),
      password: process.env.BOOTSTRAP_SUPERADMIN_PASSWORD?.trim(),
      fullName: process.env.BOOTSTRAP_SUPERADMIN_NAME?.trim() || 'Platform Owner',
      updatePasswordOnEnsure: false,
    });
    await this.ensureRoleAccount({
      roleCode: 'ADMIN',
      roleLabel: 'ADMIN',
      email: process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase(),
      phone: process.env.BOOTSTRAP_ADMIN_PHONE?.trim(),
      password: process.env.BOOTSTRAP_ADMIN_PASSWORD?.trim(),
      fullName: process.env.BOOTSTRAP_ADMIN_NAME?.trim() || 'Moka Operations Admin',
      updatePasswordOnEnsure: false,
    });
    await this.ensureRoleAccount({
      roleCode: 'MANAGER',
      roleLabel: 'MANAGER',
      email: process.env.BOOTSTRAP_MANAGER_EMAIL?.trim().toLowerCase(),
      phone: process.env.BOOTSTRAP_MANAGER_PHONE?.trim(),
      password: process.env.BOOTSTRAP_MANAGER_PASSWORD?.trim(),
      fullName: process.env.BOOTSTRAP_MANAGER_NAME?.trim() || 'Moka Operations Manager',
      updatePasswordOnEnsure: false,
    });
  }

  private async ensureRoles() {
    const roles = [
      { code: 'SUPER_ADMIN', name: 'Super Admin' },
      { code: 'ADMIN', name: 'Admin' },
      { code: 'MANAGER', name: 'Manager' },
      { code: 'STAFF', name: 'Staff' },
      { code: 'CUSTOMER', name: 'Customer' },
    ];

    for (const role of roles) {
      const permissions = resolvePermissionsForRole(role.code as any);
      await this.prisma.role.upsert({
        where: { code: role.code },
        update: { name: role.name, permissions },
        create: { ...role, permissions },
      });
    }
  }

  private async normalizeLegacyUserPhones() {
    const users = await this.prisma.user.findMany({
      where: {
        phone: {
          not: null,
        },
      },
      select: {
        id: true,
        phone: true,
      },
    });

    for (const user of users) {
      const normalizedPhone = normalizeVietnamPhone(user.phone);

      if (!normalizedPhone) {
        this.logger.warn(`Skipping invalid legacy phone for user ${user.id}.`);
        continue;
      }

      if (normalizedPhone === user.phone) {
        continue;
      }

      const duplicate = await this.prisma.user.findFirst({
        where: {
          phone: normalizedPhone,
          id: {
            not: user.id,
          },
        },
        select: { id: true },
      });

      if (duplicate) {
        this.logger.warn(
          `Skipping phone normalization for user ${user.id} because ${normalizedPhone} is already used by ${duplicate.id}.`,
        );
        continue;
      }

      await this.prisma.user.update({
        where: { id: user.id },
        data: { phone: normalizedPhone },
      });
    }
  }

  private async ensureRoleAccount(params: {
    roleCode: string;
    roleLabel: string;
    email?: string;
    phone?: string;
    password?: string;
    fullName: string;
    updatePasswordOnEnsure: boolean;
  }) {
    const { roleCode, roleLabel, password, fullName, updatePasswordOnEnsure } = params;
    const email = params.email && isValidEmail(params.email) ? normalizeEmail(params.email) : null;
    const phone = normalizeVietnamPhone(params.phone);
    if (!email || !password) {
      return;
    }

    const role = await this.prisma.role.findUnique({
      where: { code: roleCode },
    });

    if (!role) {
      this.logger.warn(`${roleLabel} role is missing during bootstrap.`);
      return;
    }

    const existingUser =
      (email
        ? await this.prisma.user.findUnique({
            where: { email },
          })
        : null) ||
      (phone
        ? await this.prisma.user.findUnique({
            where: { phone },
          })
        : null);

    if (existingUser) {
      const data: Record<string, unknown> = {
        fullName,
        email,
        phone,
        phoneVerifiedAt: phone ? new Date() : null,
        roleId: role.id,
        deletedAt: null,
      };

      if (updatePasswordOnEnsure) {
        data.passwordHash = await bcrypt.hash(password, 10);
      }

      await this.prisma.user.update({
        where: { id: existingUser.id },
        data,
      });

      this.logger.log(`Bootstrapped ${roleLabel} account ensured for ${email}`);
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await this.prisma.user.create({
      data: {
        email,
        phone,
        phoneVerifiedAt: phone ? new Date() : null,
        fullName,
        passwordHash,
        roleId: role.id,
      },
    });

    this.logger.log(`Bootstrapped ${roleLabel} account created for ${email}`);
  }
}
