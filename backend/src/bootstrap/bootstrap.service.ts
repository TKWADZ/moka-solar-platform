import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { resolvePermissionsForRole } from '../common/auth/permissions';
import { normalizeVietnamPhone } from '../common/helpers/identity.helper';

@Injectable()
export class BootstrapService implements OnModuleInit {
  private readonly logger = new Logger(BootstrapService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.ensureRoles();
    await this.normalizeLegacyUserPhones();
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

}
