import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/types/authenticated-user.type';
import { AuditLogsService } from './audit-logs.service';

@Controller('audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Get()
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  @Permissions('audit.read')
  findAll(
    @Query('limit') limit?: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('action') action?: string,
  ) {
    return this.auditLogsService.findAll(Number(limit || 50), {
      entityType: entityType?.trim() || undefined,
      entityId: entityId?.trim() || undefined,
      action: action?.trim() || undefined,
    });
  }

  @Get('timeline/:entityType/:entityId')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF')
  @Permissions('activity.read')
  findTimeline(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
    @Query('limit') limit?: string,
  ) {
    return this.auditLogsService.listEntityTimeline(
      entityType,
      entityId,
      Number(limit || 100),
    );
  }

  @Get('internal-notes/:entityType/:entityId')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF')
  @Permissions('internal_notes.read')
  listInternalNotes(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
  ) {
    return this.auditLogsService.listInternalNotes(entityType, entityId);
  }

  @Post('internal-notes/:entityType/:entityId')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF')
  @Permissions('internal_notes.manage')
  createInternalNote(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
    @Body() body: { body?: string; note?: string; moduleKey?: string },
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const noteBody = body.body?.trim() || body.note?.trim() || '';

    if (!noteBody) {
      throw new BadRequestException('Noi dung ghi chu noi bo khong duoc de trong.');
    }

    return this.auditLogsService.createInternalNote({
      entityType,
      entityId,
      body: noteBody,
      actorId: actor.sub,
      moduleKey: body.moduleKey?.trim() || undefined,
    });
  }

  @Get('assignment/:entityType/:entityId')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF')
  @Permissions('assignments.read')
  getAssignment(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
  ) {
    return this.auditLogsService.getAssignment(entityType, entityId);
  }

  @Patch('assignment/:entityType/:entityId')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF')
  @Permissions('assignments.manage')
  updateAssignment(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
    @Body() body: { assignedToUserId?: string | null; moduleKey?: string },
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.auditLogsService.assignEntity({
      entityType,
      entityId,
      assignedToUserId: body.assignedToUserId?.trim() || null,
      actorId: actor.sub,
      moduleKey: body.moduleKey?.trim() || undefined,
    });
  }
}
