import { IsEmail, IsOptional, IsString, IsUrl } from 'class-validator';

export class UpdateDeyeConnectionDto {
  @IsOptional()
  @IsString()
  accountName?: string;

  @IsOptional()
  @IsString()
  appId?: string;

  @IsOptional()
  @IsString()
  appSecret?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsUrl({
    require_protocol: true,
  })
  baseUrl?: string;

  @IsOptional()
  @IsString()
  status?: string;
}
