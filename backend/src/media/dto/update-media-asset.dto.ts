import { Transform } from 'class-transformer';
import { IsArray, IsOptional, IsString, ValidateIf } from 'class-validator';

export class UpdateMediaAssetDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  altText?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string' || value === undefined || value === null) {
      return value;
    }

    if (Array.isArray(value)) {
      return value;
    }

    return String(value);
  })
  @ValidateIf((_, value) => typeof value === 'string')
  @IsString()
  @ValidateIf((_, value) => Array.isArray(value))
  @IsArray()
  @IsString({ each: true })
  tags?: string | string[];

  @IsOptional()
  @IsString()
  folder?: string;
}
