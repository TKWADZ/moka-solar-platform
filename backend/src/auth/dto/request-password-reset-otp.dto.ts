import { IsString } from 'class-validator';

export class RequestPasswordResetOtpDto {
  @IsString()
  phone: string;
}
