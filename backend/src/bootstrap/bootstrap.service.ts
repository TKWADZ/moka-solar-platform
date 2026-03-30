import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class BootstrapService implements OnModuleInit {
  private readonly logger = new Logger(BootstrapService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.ensureRoles();
    await this.ensureRoleAccount({
      roleCode: 'SUPER_ADMIN',
      roleLabel: 'SUPER_ADMIN',
      email: process.env.BOOTSTRAP_SUPERADMIN_EMAIL?.trim().toLowerCase(),
      password: process.env.BOOTSTRAP_SUPERADMIN_PASSWORD?.trim(),
      fullName: process.env.BOOTSTRAP_SUPERADMIN_NAME?.trim() || 'Platform Owner',
      updatePasswordOnEnsure: false,
    });
    await this.ensureRoleAccount({
      roleCode: 'ADMIN',
      roleLabel: 'ADMIN',
      email: process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase(),
      password: process.env.BOOTSTRAP_ADMIN_PASSWORD?.trim(),
      fullName: process.env.BOOTSTRAP_ADMIN_NAME?.trim() || 'Moka Operations Admin',
      updatePasswordOnEnsure: false,
    });
  }

  private async ensureRoles() {
    const roles = [
      { code: 'SUPER_ADMIN', name: 'Super Admin' },
      { code: 'ADMIN', name: 'Admin' },
      { code: 'STAFF', name: 'Staff' },
      { code: 'CUSTOMER', name: 'Customer' },
    ];

    for (const role of roles) {
      await this.prisma.role.upsert({
        where: { code: role.code },
        update: { name: role.name },
        create: role,
      });
    }
  }

  private async ensureRoleAccount(params: {
    roleCode: string;
    roleLabel: string;
    email?: string;
    password?: string;
    fullName: string;
    updatePasswordOnEnsure: boolean;
  }) {
    const { roleCode, roleLabel, email, password, fullName, updatePasswordOnEnsure } = params;
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

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      const data: Record<string, unknown> = {
        fullName,
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
        fullName,
        passwordHash,
        roleId: role.id,
      },
    });

    this.logger.log(`Bootstrapped ${roleLabel} account created for ${email}`);
  }
}
