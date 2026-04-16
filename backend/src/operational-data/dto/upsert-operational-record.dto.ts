import { SystemStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class UpsertOperationalRecordDto {
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

  @Type(() => Number)
  @IsNumber()
  pvGenerationKwh: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  loadConsumedKwh?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  meterReadingStart?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  meterReadingEnd?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  savingsAmount?: number;

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
  discountAmount?: number;

  @IsOptional()
  @IsEnum(SystemStatus)
  systemStatus?: SystemStatus;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  dataSourceNote?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  meterReset?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  meterReplaced?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  contractRestart?: boolean;
}
