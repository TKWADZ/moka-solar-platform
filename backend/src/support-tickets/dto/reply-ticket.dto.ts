import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class ReplyTicketDto {
  @IsString()
  message: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isInternal?: boolean;
}
