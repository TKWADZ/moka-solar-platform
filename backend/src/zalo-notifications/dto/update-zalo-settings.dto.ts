import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateZaloSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  appId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  appSecret?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  oaId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  accessToken?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  refreshToken?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  apiBaseUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  templateInvoiceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  templateReminderId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  templatePaidId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  templateOtpId?: string;
}
