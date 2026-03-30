import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateContactInquiryDto {
  @IsString()
  @MaxLength(120)
  fullName!: string;

  @IsEmail()
  @MaxLength(160)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  companyName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  siteCount?: string;

  @IsString()
  @MaxLength(4000)
  message!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  sourcePage?: string;
}
