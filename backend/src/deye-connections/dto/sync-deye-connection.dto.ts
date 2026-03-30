import { Transform, Type } from 'class-transformer';
import { IsArray, IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class SyncDeyeConnectionDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2020)
  @Max(2100)
  year?: number;

  @IsOptional()
  @IsString()
  startAt?: string;

  @IsOptional()
  @IsString()
  endAt?: string;

  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : []))
  @IsArray()
  @IsString({ each: true })
  stationIds?: string[];

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeStationSync?: boolean;
}
