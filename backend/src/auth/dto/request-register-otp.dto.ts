import { IsEmail, IsOptional, IsString } from 'class-validator';

export class RequestRegisterOtpDto {
  @IsString()
  fullName: string;

  @IsString()
  phone: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}
