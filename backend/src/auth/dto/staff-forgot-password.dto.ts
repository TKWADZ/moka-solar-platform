import { IsEmail, IsString, MaxLength } from 'class-validator';

export class StaffForgotPasswordDto {
  @IsString()
  @IsEmail()
  @MaxLength(254)
  email: string;
}
