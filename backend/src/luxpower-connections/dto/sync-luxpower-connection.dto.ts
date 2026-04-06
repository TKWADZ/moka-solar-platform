import { Type } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export class SyncLuxPowerConnectionDto {
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  forceRelogin?: boolean;
}
