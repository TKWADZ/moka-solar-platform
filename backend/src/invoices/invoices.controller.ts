import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user.type';
import { FeaturePlugin } from '../feature-plugins/feature-plugin.decorator';
import { FeaturePluginGuard } from '../feature-plugins/feature-plugin.guard';
import { hasPermission } from '../common/auth/permissions';

@Controller('invoices')
@FeaturePlugin('billing')
@UseGuards(JwtAuthGuard, RolesGuard, FeaturePluginGuard)
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF')
  @Permissions('billing.read')
  findAll() {
    return this.invoicesService.findAll();
  }

  @Get('me')
  @Roles('CUSTOMER')
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.invoicesService.findMine(user.customerId!);
  }

  @Get(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF', 'CUSTOMER')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    this.assertStaffPermission(user, 'billing.read');
    return this.invoicesService.findOne(id, user);
  }

  @Get(':id/pdf')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF', 'CUSTOMER')
  async downloadPdf(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    this.assertStaffPermission(user, 'billing.read');
    const result = await this.invoicesService.buildPdf(id, user);
    return new StreamableFile(result.buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${result.fileName}"`,
    });
  }

  @Post('generate/:contractId')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF')
  @Permissions('billing.manage')
  generate(
    @Param('contractId') contractId: string,
    @Query('month') month: string,
    @Query('year') year: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.invoicesService.generateMonthlyInvoice(
      contractId,
      Number(month),
      Number(year),
      user.sub,
    );
  }

  private assertStaffPermission(
    user: AuthenticatedUser,
    permission: 'billing.read',
  ) {
    if (user.role !== 'CUSTOMER' && !hasPermission(user.permissions, permission)) {
      throw new ForbiddenException('You do not have permission to access this invoice');
    }
  }
}
