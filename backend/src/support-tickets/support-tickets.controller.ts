import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { SupportTicketsService } from './support-tickets.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { ReplyTicketDto } from './dto/reply-ticket.dto';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto';
import { AuthenticatedUser } from '../common/types/authenticated-user.type';
import { FeaturePlugin } from '../feature-plugins/feature-plugin.decorator';
import { FeaturePluginGuard } from '../feature-plugins/feature-plugin.guard';

@Controller('support-tickets')
@FeaturePlugin('support')
@UseGuards(JwtAuthGuard, RolesGuard, FeaturePluginGuard)
export class SupportTicketsController {
  constructor(private readonly supportTicketsService: SupportTicketsService) {}

  @Get()
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  findAll() {
    return this.supportTicketsService.findAll();
  }

  @Get('me')
  @Roles('CUSTOMER')
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.supportTicketsService.findMine(user.customerId!);
  }

  @Post()
  @Roles('CUSTOMER')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTicketDto) {
    return this.supportTicketsService.create(user, dto);
  }

  @Post(':ticketId/reply')
  @Roles('CUSTOMER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  reply(
    @Param('ticketId') ticketId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ReplyTicketDto,
  ) {
    return this.supportTicketsService.reply(ticketId, user, dto);
  }

  @Patch(':ticketId/status')
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  updateStatus(
    @Param('ticketId') ticketId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateTicketStatusDto,
  ) {
    return this.supportTicketsService.updateStatus(ticketId, dto.status, user);
  }
}
