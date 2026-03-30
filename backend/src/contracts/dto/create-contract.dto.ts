import { ContractStatus, ContractType } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateContractDto {
  @IsString()
  customerId: string;

  @IsString()
  solarSystemId: string;

  @IsString()
  servicePackageId: string;

  @IsEnum(ContractType)
  type: ContractType;

  @IsOptional()
  @IsEnum(ContractStatus)
  status?: ContractStatus;

  @IsDateString()
  startDate: string;

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
