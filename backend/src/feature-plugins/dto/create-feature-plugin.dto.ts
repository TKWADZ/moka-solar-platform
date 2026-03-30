import {
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateFeaturePluginDto {
  @IsString()
  key!: string;

  @IsString()
  name!: string;

  @IsString()
  description!: string;

  @IsString()
  category!: string;

  @IsOptional()
  @IsString()
  version?: string;

  @IsOptional()
  @IsBoolean()
  installed?: boolean;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  editable?: boolean;

  @IsOptional()
  @IsBoolean()
  isCore?: boolean;

  @IsOptional()
  @IsString()
  routePath?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  areas?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}
