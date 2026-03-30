import { IsEmail, IsOptional, IsString, IsUrl } from 'class-validator';

export class CreateDeyeConnectionDto {
  @IsString()
  accountName: string;

  @IsString()
  appId: string;

  @IsString()
  appSecret: string;

  @IsEmail()
  email: string;

  @IsString()
  password: string;

  @IsUrl({
    require_protocol: true,
  })
  baseUrl: string;

  @IsOptional()
  @IsString()
  status?: string;
}
