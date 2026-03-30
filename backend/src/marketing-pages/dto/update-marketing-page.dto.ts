import { IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';

export class UpdateMarketingPageDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  published?: boolean;

  @IsOptional()
  @IsObject()
  content?: Record<string, unknown>;
}
