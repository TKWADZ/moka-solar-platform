import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/types/authenticated-user.type';
import { RolesService } from './roles.service';

@Controller('roles')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  @Permissions('users.read')
  findAll(@CurrentUser() actor: AuthenticatedUser) {
    const roles = this.rolesService.findAll();
    if (actor.role === 'SUPER_ADMIN') {
      return roles;
    }

    return roles.then((items) =>
      items.filter((role) => ['ADMIN', 'MANAGER', 'STAFF', 'CUSTOMER'].includes(role.code)),
    );
  }
}
