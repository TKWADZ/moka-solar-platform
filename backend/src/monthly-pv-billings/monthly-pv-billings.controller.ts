import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/types/authenticated-user.type';
import { FeaturePlugin } from '../feature-plugins/feature-plugin.decorator';
import { FeaturePluginGuard } from '../feature-plugins/feature-plugin.guard';
import { ListMonthlyPvBillingsDto } from './dto/list-monthly-pv-billings.dto';
import { SyncMonthlyPvBillingDto } from './dto/sync-monthly-pv-billing.dto';
import { UpdateMonthlyPvBillingDto } from './dto/update-monthly-pv-billing.dto';
import { MonthlyPvBillingsService } from './monthly-pv-billings.service';

@Controller('monthly-pv-billings')
@FeaturePlugin('billing')
@UseGuards(JwtAuthGuard, RolesGuard, FeaturePluginGuard)
export class MonthlyPvBillingsController {
  constructor(
    private readonly monthlyPvBillingsService: MonthlyPvBillingsService,
  ) {}

  @Get()
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  list(@Query() query: ListMonthlyPvBillingsDto) {
    return this.monthlyPvBillingsService.list(query);
  }

  @Get(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  findOne(@Param('id') id: string) {
    return this.monthlyPvBillingsService.findOne(id);
  }

  @Post('sync/:systemId')
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  sync(
    @Param('systemId') systemId: string,
    @Body() dto: SyncMonthlyPvBillingDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.monthlyPvBillingsService.sync(systemId, dto, actor.sub);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateMonthlyPvBillingDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.monthlyPvBillingsService.update(id, dto, actor.sub);
  }

  @Post(':id/generate-invoice')
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  generateInvoice(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.monthlyPvBillingsService.generateInvoice(id, actor.sub);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  remove(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.monthlyPvBillingsService.remove(id, actor.sub);
  }
}
