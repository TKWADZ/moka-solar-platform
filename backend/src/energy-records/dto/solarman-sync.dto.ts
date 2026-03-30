import {
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
} from 'class-validator';

export class SolarmanSyncDto {
  @IsString()
  stationId: string;

  @IsOptional()
  @IsUrl()
  baseUrl?: string;

  @IsOptional()
  @IsString()
  appId?: string;

  @IsOptional()
  @IsString()
  appSecret?: string;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsDateString()
  recordDate?: string;

  @IsOptional()
  @IsBoolean()
  persist?: boolean;

  @IsOptional()
  @IsNumber()
  timeType?: number;

  @IsOptional()
  @IsNumber()
  loadConsumedKwh?: number;

  @IsOptional()
  @IsNumber()
  gridImportedKwh?: number;

  @IsOptional()
  @IsNumber()
  gridExportedKwh?: number;
}
