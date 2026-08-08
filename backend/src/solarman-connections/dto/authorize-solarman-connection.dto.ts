import { IsString, MaxLength, MinLength } from 'class-validator';

export class AuthorizeSolarmanConnectionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(16_384)
  refreshToken: string;
}
