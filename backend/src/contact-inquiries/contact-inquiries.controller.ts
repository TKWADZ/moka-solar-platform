import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ContactInquiryStatus } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/types/authenticated-user.type';
import { FeaturePlugin } from '../feature-plugins/feature-plugin.decorator';
import { FeaturePluginGuard } from '../feature-plugins/feature-plugin.guard';
import { CreateContactInquiryDto } from './dto/create-contact-inquiry.dto';
import { UpdateContactInquiryDto } from './dto/update-contact-inquiry.dto';
import { ContactInquiriesService } from './contact-inquiries.service';

@Controller('contact-inquiries')
@FeaturePlugin('contact_inquiries')
export class ContactInquiriesController {
  constructor(private readonly contactInquiriesService: ContactInquiriesService) {}

  @Post('public')
  @UseGuards(FeaturePluginGuard)
  create(@Body() dto: CreateContactInquiryDto) {
    return this.contactInquiriesService.create(dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard, FeaturePluginGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  findAll(@Query('status') status?: ContactInquiryStatus) {
    return this.contactInquiriesService.findAll(status);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard, FeaturePluginGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateContactInquiryDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.contactInquiriesService.update(id, dto, actor);
  }
}
