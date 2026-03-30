import { Controller, Get, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user.type';
import { FeaturePlugin } from '../feature-plugins/feature-plugin.decorator';
import { FeaturePluginGuard } from '../feature-plugins/feature-plugin.guard';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard, FeaturePluginGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('admin-dashboard')
  @FeaturePlugin('admin_dashboard')
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  adminDashboard() {
    return this.reportsService.adminDashboard();
  }

  @Get('customer-dashboard')
  @FeaturePlugin('customer_dashboard')
  @Roles('CUSTOMER')
  customerDashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.reportsService.customerDashboard(user.customerId!);
  }
}
