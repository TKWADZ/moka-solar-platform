import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateAiSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  apiKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  model?: string;

  @IsOptional()
  @IsBoolean()
  clearStoredApiKey?: boolean;
}
