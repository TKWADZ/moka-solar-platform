import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateLuxPowerConnectionDto {
  @IsString()
  accountName: string;

  @ValidateIf((value: CreateLuxPowerConnectionDto) => !value.useDemoMode)
  @IsString()
  username?: string;

  @ValidateIf((value: CreateLuxPowerConnectionDto) => !value.useDemoMode)
  @IsString()
  password?: string;

  @IsOptional()
  @IsString()
  plantId?: string;

  @IsOptional()
  @IsString()
  inverterSerial?: string;

  @IsOptional()
  @IsString()
  solarSystemId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(1440)
  pollingIntervalMinutes?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  useDemoMode?: boolean;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
