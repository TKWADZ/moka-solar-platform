import { IsString } from 'class-validator';

export class SyncDeyeStationDto {
  @IsString()
  connectionId: string;

  @IsString()
  stationId: string;
}
