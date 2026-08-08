import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SolarmanConnectionLockService {
  constructor(private readonly prisma: PrismaService) {}

  async withRefreshLock<T>(
    connectionId: string,
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ) {
    return this.prisma.$transaction(
      async (transaction) => {
        await transaction.$queryRaw<Array<{ lock_result: string | null }>>(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtext('moka-solarman-refresh'), hashtext(${connectionId}))::text AS lock_result`,
        );
        return operation(transaction);
      },
      {
        maxWait: 10_000,
        timeout: 30_000,
      },
    );
  }
}
