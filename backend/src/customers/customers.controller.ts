import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CustomersService } from './customers.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user.type';
import { FeaturePlugin } from '../feature-plugins/feature-plugin.decorator';
import { FeaturePluginGuard } from '../feature-plugins/feature-plugin.guard';
import { UpdateMyProfileDto } from './dto/update-my-profile.dto';
import { ChangeMyPasswordDto } from './dto/change-my-password.dto';

const MAX_AVATAR_FILE_SIZE = 5 * 1024 * 1024;

@Controller('customers')
@FeaturePlugin('customers')
@UseGuards(JwtAuthGuard, RolesGuard, FeaturePluginGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF')
  @Permissions('customers.read')
  findAll() {
    return this.customersService.findAll();
  }

  @Get('me/profile')
  @FeaturePlugin('customer_profile')
  @Roles('CUSTOMER')
  myProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.customersService.getMyProfile(user.customerId!);
  }

  @Patch('me/profile')
  @FeaturePlugin('customer_profile')
  @Roles('CUSTOMER')
  updateMyProfile(
    @Body() dto: UpdateMyProfileDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.customersService.updateMyProfile(user.customerId!, dto, user.sub);
  }

  @Patch('me/password')
  @FeaturePlugin('customer_profile')
  @Roles('CUSTOMER')
  changeMyPassword(
    @Body() dto: ChangeMyPasswordDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.customersService.changeMyPassword(user.customerId!, dto, user.sub);
  }

  @Post('me/avatar')
  @FeaturePlugin('customer_profile')
  @Roles('CUSTOMER')
  @UseInterceptors(
    FileInterceptor('avatar', {
      limits: {
        fileSize: MAX_AVATAR_FILE_SIZE,
      },
    }),
  )
  uploadMyAvatar(
    @UploadedFile() avatar: any,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.customersService.uploadMyAvatar(user.customerId!, avatar, user.sub);
  }

  @Get(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF')
  @Permissions('customers.read')
  findOne(@Param('id') id: string) {
    return this.customersService.findOne(id);
  }

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  @Permissions('customers.manage')
  create(@Body() dto: CreateCustomerDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.customersService.create(dto, actor.sub);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  @Permissions('customers.manage')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.customersService.update(id, dto, actor.sub);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Permissions('customers.manage')
  remove(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.customersService.remove(id, actor.sub);
  }
}
