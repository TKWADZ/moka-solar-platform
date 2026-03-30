import { ContractStatus, ContractType } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpdateContractDto {
  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  solarSystemId?: string;

  @IsOptional()
  @IsString()
  servicePackageId?: string;

  @IsOptional()
  @IsEnum(ContractType)
  type?: ContractType;

  @IsOptional()
  @IsEnum(ContractStatus)
  status?: ContractStatus;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsNumber()
  termMonths?: number;

  @IsOptional()
  @IsNumber()
  pricePerKwh?: number;

  @IsOptional()
  @IsNumber()
  fixedMonthlyFee?: number;

  @IsOptional()
  @IsNumber()
  interestRate?: number;

  @IsOptional()
  @IsNumber()
  vatRate?: number;

  @IsOptional()
  @IsString()
  contractFileUrl?: string;
}
