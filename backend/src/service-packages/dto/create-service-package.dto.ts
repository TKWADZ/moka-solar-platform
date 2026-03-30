import { ContractType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateServicePackageDto {
  @IsString()
  packageCode: string;

  @IsString()
  name: string;

  @IsEnum(ContractType)
  contractType: ContractType;

  @IsOptional()
  @IsString()
  shortDescription?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  pricePerKwh?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  fixedMonthlyFee?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maintenanceFee?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  annualEscalationRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  vatRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lateFeeRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  earlyDiscountRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  defaultTermMonths?: number;

  @IsOptional()
  @IsString()
  billingRule?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;
}
