import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class ImportOperationalDataDto {
  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  overwriteExisting?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  syncBilling?: boolean;
}
