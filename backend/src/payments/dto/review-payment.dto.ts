import { IsIn, IsOptional, IsString } from 'class-validator';

export class ReviewPaymentDto {
  @IsIn(['SUCCESS', 'FAILED'])
  status: 'SUCCESS' | 'FAILED';

  @IsOptional()
  @IsString()
  reviewNote?: string;
}
