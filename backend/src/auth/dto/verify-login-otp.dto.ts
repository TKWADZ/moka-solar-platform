import { IsString, Length } from 'class-validator';

export class VerifyLoginOtpDto {
  @IsString()
  phone: string;

  @IsString()
  requestId: string;

  @IsString()
  @Length(4, 8)
  otpCode: string;
}
