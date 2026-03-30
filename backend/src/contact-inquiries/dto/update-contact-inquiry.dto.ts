import { ContactInquiryStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateContactInquiryDto {
  @IsOptional()
  @IsEnum(ContactInquiryStatus)
  status?: ContactInquiryStatus;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  internalNote?: string;
}
