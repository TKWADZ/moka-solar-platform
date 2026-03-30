import { TicketPriority } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class CreateTicketDto {
  @IsString()
  title: string;

  @IsString()
  description: string;

  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;
}
