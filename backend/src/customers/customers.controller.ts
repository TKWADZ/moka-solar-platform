import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user.type';
import { FeaturePlugin } from '../feature-plugins/feature-plugin.decorator';
import { FeaturePluginGuard } from '../feature-plugins/feature-plugin.guard';

@Controller('customers')
@FeaturePlugin('customers')
@UseGuards(JwtAuthGuard, RolesGuard, FeaturePluginGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  findAll() {
    return this.customersService.findAll();
  }

  @Get('me/profile')
  @FeaturePlugin('customer_profile')
  @Roles('CUSTOMER')
  myProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.customersService.getMyProfile(user.customerId!);
  }

  @Get(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  findOne(@Param('id') id: string) {
    return this.customersService.findOne(id);
  }

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  create(@Body() dto: CreateCustomerDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.customersService.create(dto, actor.sub);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.customersService.update(id, dto, actor.sub);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  remove(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.customersService.remove(id, actor.sub);
  }
}
