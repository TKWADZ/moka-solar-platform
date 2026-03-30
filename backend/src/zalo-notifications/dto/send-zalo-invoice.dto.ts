import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class SendZaloInvoiceDto {
  @IsOptional()
  @IsIn(['INVOICE', 'REMINDER', 'PAID'])
  templateType?: 'INVOICE' | 'REMINDER' | 'PAID';

  @IsOptional()
  @IsString()
  @MaxLength(32)
  recipientPhone?: string;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}
