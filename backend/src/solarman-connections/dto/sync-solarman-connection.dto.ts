import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class SyncSolarmanConnectionDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2020)
  @Max(2100)
  year?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  stationIds?: string[];

  @IsOptional()
  @IsBoolean()
  createMissingSystems?: boolean;
}
