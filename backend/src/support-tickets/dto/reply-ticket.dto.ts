import { IsString } from 'class-validator';

export class ReplyTicketDto {
  @IsString()
  message: string;
}
