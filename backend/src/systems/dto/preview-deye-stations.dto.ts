import { IsString } from 'class-validator';

export class PreviewDeyeStationsDto {
  @IsString()
  connectionId: string;
}
