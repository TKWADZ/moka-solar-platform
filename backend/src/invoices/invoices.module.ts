import { Module } from '@nestjs/common';
import { MonthlyPvBillingsModule } from '../monthly-pv-billings/monthly-pv-billings.module';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { InvoiceCalculatorService } from './invoice-calculator.service';
@Module({
  imports: [MonthlyPvBillingsModule],
  controllers: [InvoicesController],
  providers: [InvoicesService, InvoiceCalculatorService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
