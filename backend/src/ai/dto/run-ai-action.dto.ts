import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class RunAiActionDto {
  @IsString()
  @IsIn([
    'WRITE_ARTICLE',
    'EDIT_CONTENT',
    'GENERATE_FAQ',
    'INVOICE_REMINDER',
    'CUSTOMER_MESSAGE',
  ])
  actionType: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;

  @IsString()
  @MaxLength(4000)
  instruction: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  context?: string;

  @IsOptional()
  @IsString()
  targetType?: string;

  @IsOptional()
  @IsString()
  targetId?: string;
}
