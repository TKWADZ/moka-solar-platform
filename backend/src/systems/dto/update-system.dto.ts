import { SystemStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpdateSystemDto {
  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  systemCode?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  systemType?: string;

  @IsOptional()
  @IsNumber()
  capacityKwp?: number;

  @IsOptional()
  @IsNumber()
  panelCount?: number;

  @IsOptional()
  @IsString()
  panelBrand?: string;

  @IsOptional()
  @IsString()
  panelModel?: string;

  @IsOptional()
  @IsString()
  inverterBrand?: string;

  @IsOptional()
  @IsString()
  inverterModel?: string;

  @IsOptional()
  @IsString()
  monitoringProvider?: string;

  @IsOptional()
  @IsString()
  monitoringPlantId?: string;

  @IsOptional()
  @IsString()
  stationId?: string;

  @IsOptional()
  @IsString()
  stationName?: string;

  @IsOptional()
  @IsString()
  sourceSystem?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  defaultUnitPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  defaultVatRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  defaultTaxAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  defaultDiscountAmount?: number;

  @IsOptional()
  @IsDateString()
  installDate?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsEnum(SystemStatus)
  status?: SystemStatus;
}
