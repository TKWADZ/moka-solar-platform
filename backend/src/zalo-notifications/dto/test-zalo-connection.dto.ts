import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class TestZaloConnectionDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}
