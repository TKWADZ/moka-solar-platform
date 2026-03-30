import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpdateEnergyRecordDto {
  @IsOptional()
  @IsString()
  solarSystemId?: string;

  @IsOptional()
  @IsDateString()
  recordDate?: string;

  @IsOptional()
  @IsNumber()
  solarGeneratedKwh?: number;

  @IsOptional()
  @IsNumber()
  loadConsumedKwh?: number;

  @IsOptional()
  @IsNumber()
  gridImportedKwh?: number;

  @IsOptional()
  @IsNumber()
  gridExportedKwh?: number;

  @IsOptional()
  @IsNumber()
  selfConsumedKwh?: number;

  @IsOptional()
  @IsNumber()
  savingAmount?: number;
}
