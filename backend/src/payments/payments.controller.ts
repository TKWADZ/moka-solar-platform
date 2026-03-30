import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { createReadStream } from 'fs';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user.type';
import { FeaturePlugin } from '../feature-plugins/feature-plugin.decorator';
import { FeaturePluginGuard } from '../feature-plugins/feature-plugin.guard';
import { ReviewPaymentDto } from './dto/review-payment.dto';
import { SubmitManualPaymentDto } from './dto/submit-manual-payment.dto';

const MAX_PAYMENT_PROOF_FILE_SIZE = 8 * 1024 * 1024;

@Controller('payments')
@FeaturePlugin('payments')
@UseGuards(JwtAuthGuard, RolesGuard, FeaturePluginGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  findAll() {
    return this.paymentsService.findAll();
  }

  @Post(':invoiceId/mock-pay')
  @Roles('CUSTOMER', 'SUPER_ADMIN', 'ADMIN')
  pay(
    @Param('invoiceId') invoiceId: string,
    @Body() dto: { method?: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.paymentsService.createMockPayment(invoiceId, dto?.method, user);
  }

  @Get('me')
  @Roles('CUSTOMER')
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.paymentsService.findMine(user.customerId!);
  }

  @Post(':invoiceId/manual-submission')
  @Roles('CUSTOMER')
  @UseInterceptors(
    FileInterceptor('proof', {
      limits: {
        fileSize: MAX_PAYMENT_PROOF_FILE_SIZE,
      },
    }),
  )
  submitManualPayment(
    @Param('invoiceId') invoiceId: string,
    @Body() dto: SubmitManualPaymentDto,
    @UploadedFile() proof: any,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.paymentsService.submitManualPayment(invoiceId, dto, proof, user);
  }

  @Patch(':paymentId/review')
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  reviewManualPayment(
    @Param('paymentId') paymentId: string,
    @Body() dto: ReviewPaymentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.paymentsService.reviewManualPayment(paymentId, dto, user);
  }

  @Get(':paymentId/proof')
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF', 'CUSTOMER')
  async downloadProof(
    @Param('paymentId') paymentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const result = await this.paymentsService.resolveProofFile(paymentId, user);
    return new StreamableFile(createReadStream(result.filePath), {
      type: result.mimeType,
      disposition: `inline; filename="${result.originalName}"`,
    });
  }
}
