import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ContractsService } from './contracts.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user.type';
import { FeaturePlugin } from '../feature-plugins/feature-plugin.decorator';
import { FeaturePluginGuard } from '../feature-plugins/feature-plugin.guard';

@Controller('contracts')
@FeaturePlugin('contracts')
@UseGuards(JwtAuthGuard, RolesGuard, FeaturePluginGuard)
export class ContractsController {
  constructor(private readonly contractsService: ContractsService) {}

  @Get()
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  findAll() {
    return this.contractsService.findAll();
  }

  @Get('me')
  @Roles('CUSTOMER')
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.contractsService.findMine(user.customerId!);
  }

  @Get(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  findOne(@Param('id') id: string) {
    return this.contractsService.findOne(id);
  }

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  create(@Body() dto: CreateContractDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.contractsService.create(dto, actor.sub);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateContractDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.contractsService.update(id, dto, actor.sub);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  remove(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.contractsService.remove(id, actor.sub);
  }
}
