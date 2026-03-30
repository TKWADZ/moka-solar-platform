import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SaveAiActionDraftDto {
  @IsString()
  @MaxLength(60)
  actionType: string;

  @IsString()
  @MaxLength(160)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  prompt?: string;

  @IsString()
  @MaxLength(20000)
  content: string;

  @IsOptional()
  @IsString()
  targetType?: string;

  @IsOptional()
  @IsString()
  targetId?: string;

  @IsOptional()
  metadata?: Record<string, unknown>;
}
