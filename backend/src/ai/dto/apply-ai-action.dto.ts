import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ApplyAiActionDto {
  @IsOptional()
  @IsString()
  draftId?: string;

  @IsString()
  @MaxLength(60)
  actionType: string;

  @IsString()
  @MaxLength(160)
  title: string;

  @IsString()
  @MaxLength(20000)
  content: string;

  @IsOptional()
  @IsString()
  targetType?: string;

  @IsOptional()
  @IsString()
  targetId?: string;
}
