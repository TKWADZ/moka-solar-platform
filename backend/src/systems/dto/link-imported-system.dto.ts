import { IsString } from 'class-validator';

export class LinkImportedSystemDto {
  @IsString()
  targetSystemId: string;
}
