import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsOptional, IsString } from 'class-validator';

export class ReportSystemDashboardPresenceDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(24)
  @IsString({ each: true })
  systemIds!: string[];

  @IsOptional()
  @IsString()
  pageKey?: string;
}
