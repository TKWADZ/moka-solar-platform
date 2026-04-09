import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateSolarmanConnectionDto {
  @IsString()
  accountName: string;

  @IsOptional()
  @IsString()
  providerType?: string;

  @IsString()
  usernameOrEmail: string;

  @IsString()
  password: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  defaultUnitPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  defaultTaxAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  defaultDiscountAmount?: number;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
