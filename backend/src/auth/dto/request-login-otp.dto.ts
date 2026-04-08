import { IsString } from 'class-validator';

export class RequestLoginOtpDto {
  @IsString()
  phone: string;
}
