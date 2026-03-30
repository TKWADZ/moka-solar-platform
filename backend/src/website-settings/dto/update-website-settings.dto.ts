import { IsObject, IsOptional, IsString } from 'class-validator';

export class UpdateWebsiteSettingsDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsObject()
  content?: Record<string, unknown>;
}
