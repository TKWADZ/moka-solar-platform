import { Type } from 'class-transformer';
import { IsIn, IsOptional, Max, Min } from 'class-validator';

export class GenerateInvoiceRemindersDto {
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(12)
  billingMonth?: number;

  @IsOptional()
  @Type(() => Number)
  @Min(2020)
  @Max(2100)
  billingYear?: number;

  @IsOptional()
  @IsIn(['UPCOMING', 'DUE', 'OVERDUE', 'ALL'])
  templateType?: 'UPCOMING' | 'DUE' | 'OVERDUE' | 'ALL';
}
