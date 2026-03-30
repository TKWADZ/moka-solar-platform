import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class BootstrapService implements OnModuleInit {
  private readonly logger = new Logger(BootstrapService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.ensureRoles();
    await this.ensureSuperAdmin();
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

  private async ensureSuperAdmin() {
    const email = process.env.BOOTSTRAP_SUPERADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.BOOTSTRAP_SUPERADMIN_PASSWORD?.trim();
    const fullName = process.env.BOOTSTRAP_SUPERADMIN_NAME?.trim() || 'Platform Owner';

    if (!email || !password) {
      return;
    }

    const superAdminRole = await this.prisma.role.findUnique({
      where: { code: 'SUPER_ADMIN' },
    });

    if (!superAdminRole) {
      this.logger.warn('SUPER_ADMIN role is missing during bootstrap.');
      return;
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      await this.prisma.user.update({
        where: { id: existingUser.id },
        data: {
          fullName,
          roleId: superAdminRole.id,
          deletedAt: null,
        },
      });

      this.logger.log(`Bootstrapped SUPER_ADMIN role ensured for ${email}`);
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await this.prisma.user.create({
      data: {
        email,
        fullName,
        passwordHash,
        roleId: superAdminRole.id,
      },
    });

    this.logger.log(`Bootstrapped SUPER_ADMIN account created for ${email}`);
  }
}
