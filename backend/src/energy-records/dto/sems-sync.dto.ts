import {
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
} from 'class-validator';

export class SemsSyncDto {
  @IsString()
  plantId: string;

  @IsOptional()
  @IsString()
  account?: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsUrl()
  loginUrl?: string;

  @IsOptional()
  @IsDateString()
  recordDate?: string;

  @IsOptional()
  @IsBoolean()
  persist?: boolean;

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
