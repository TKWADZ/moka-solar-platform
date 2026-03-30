import { IsDateString, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateEnergyRecordDto {
  @IsString()
  solarSystemId: string;

  @IsDateString()
  recordDate: string;

  @IsNumber()
  solarGeneratedKwh: number;

  @IsNumber()
  loadConsumedKwh: number;

  @IsNumber()
  gridImportedKwh: number;

  @IsNumber()
  gridExportedKwh: number;

  @IsOptional()
  @IsNumber()
  selfConsumedKwh?: number;

  @IsOptional()
  @IsNumber()
  savingAmount?: number;
}
