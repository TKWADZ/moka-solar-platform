import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  fullName: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsIn(['SUPER_ADMIN', 'ADMIN', 'STAFF', 'CUSTOMER'])
  roleCode: 'SUPER_ADMIN' | 'ADMIN' | 'STAFF' | 'CUSTOMER';
}
