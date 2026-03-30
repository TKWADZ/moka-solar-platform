import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { AssistantChatMessageDto } from './assistant-chat.dto';

export class PublicAssistantChatDto {
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => AssistantChatMessageDto)
  messages!: AssistantChatMessageDto[];

  @IsString()
  @MaxLength(120)
  visitorId!: string;

  @IsBoolean()
  humanCheckConfirmed!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  pagePath?: string;
}
