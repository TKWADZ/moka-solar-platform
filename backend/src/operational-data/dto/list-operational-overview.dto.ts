import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class ListOperationalOverviewDto {
  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  sourceKind?: string;

  @IsOptional()
  @IsString()
  systemStatus?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  staleDays?: number;
}
