import { IsString, Length, MinLength } from 'class-validator';

export class ResetPasswordWithOtpDto {
  @IsString()
  phone: string;

  @IsString()
  requestId: string;

  @IsString()
  @Length(4, 8)
  otpCode: string;

  @IsString()
  @MinLength(6)
  password: string;
}
