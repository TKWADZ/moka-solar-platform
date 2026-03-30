import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { CustomerPortalAggregateService } from './customer-portal-aggregate.service';
import { ReportsService } from './reports.service';
@Module({
  controllers: [ReportsController],
  providers: [ReportsService, CustomerPortalAggregateService],
})
export class ReportsModule {}
