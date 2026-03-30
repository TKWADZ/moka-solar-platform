import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class SyncMonthlyPvBillingDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month: number;

  @Type(() => Number)
  @IsInt()
  @Min(2020)
  @Max(2100)
  year: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  pvGenerationKwh?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  unitPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  vatRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  taxRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  discountAmount?: number;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
