import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { createReadStream } from 'fs';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/types/authenticated-user.type';
import { FeaturePlugin } from '../feature-plugins/feature-plugin.decorator';
import { FeaturePluginGuard } from '../feature-plugins/feature-plugin.guard';
import { AssignTicketDto } from './dto/assign-ticket.dto';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { ListSupportTicketsDto } from './dto/list-support-tickets.dto';
import { ReplyTicketDto } from './dto/reply-ticket.dto';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto';
import { SupportTicketsService } from './support-tickets.service';

const MAX_TICKET_ATTACHMENT_FILE_SIZE = 8 * 1024 * 1024;

@Controller('support-tickets')
@FeaturePlugin('support')
@UseGuards(JwtAuthGuard, RolesGuard, FeaturePluginGuard)
export class SupportTicketsController {
  constructor(private readonly supportTicketsService: SupportTicketsService) {}

  @Get()
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  findAll(@Query() query: ListSupportTicketsDto) {
    return this.supportTicketsService.findAll(query);
  }

  @Get('me')
  @Roles('CUSTOMER')
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.supportTicketsService.findMine(user.customerId!);
  }

  @Get('unread-summary')
  @Roles('CUSTOMER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  unreadSummary(@CurrentUser() user: AuthenticatedUser) {
    return this.supportTicketsService.getUnreadSummary(user);
  }

  @Get(':ticketId')
  @Roles('CUSTOMER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  findOne(@Param('ticketId') ticketId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.supportTicketsService.findOne(ticketId, user);
  }

  @Post()
  @Roles('CUSTOMER')
  @UseInterceptors(
    FilesInterceptor('attachments', 10, {
      limits: {
        fileSize: MAX_TICKET_ATTACHMENT_FILE_SIZE,
      },
    }),
  )
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTicketDto,
    @UploadedFiles() attachments: Array<any>,
  ) {
    return this.supportTicketsService.create(user, dto, attachments || []);
  }

  @Post(':ticketId/messages')
  @Roles('CUSTOMER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  @UseInterceptors(
    FilesInterceptor('attachments', 10, {
      limits: {
        fileSize: MAX_TICKET_ATTACHMENT_FILE_SIZE,
      },
    }),
  )
  reply(
    @Param('ticketId') ticketId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ReplyTicketDto,
    @UploadedFiles() attachments: Array<any>,
  ) {
    return this.supportTicketsService.reply(ticketId, user, dto, attachments || []);
  }

  @Post(':ticketId/reply')
  @Roles('CUSTOMER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  @UseInterceptors(
    FilesInterceptor('attachments', 10, {
      limits: {
        fileSize: MAX_TICKET_ATTACHMENT_FILE_SIZE,
      },
    }),
  )
  replyLegacy(
    @Param('ticketId') ticketId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ReplyTicketDto,
    @UploadedFiles() attachments: Array<any>,
  ) {
    return this.supportTicketsService.reply(ticketId, user, dto, attachments || []);
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

  @Patch(':ticketId/assign')
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  assign(
    @Param('ticketId') ticketId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AssignTicketDto,
  ) {
    return this.supportTicketsService.assign(ticketId, dto, user);
  }

  @Patch(':ticketId/read')
  @Roles('CUSTOMER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  markRead(@Param('ticketId') ticketId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.supportTicketsService.markRead(ticketId, user);
  }

  @Get(':ticketId/attachments/:attachmentId/file')
  @Roles('CUSTOMER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  async downloadAttachment(
    @Param('ticketId') ticketId: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const result = await this.supportTicketsService.resolveAttachment(ticketId, attachmentId, user);
    return new StreamableFile(createReadStream(result.filePath), {
      type: result.mimeType,
      disposition: `inline; filename="${encodeURIComponent(result.originalName)}"`,
    });
  }
}
