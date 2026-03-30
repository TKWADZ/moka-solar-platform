import { IsNumber, IsOptional } from 'class-validator';

export class MockSyncDto {
  @IsOptional()
  @IsNumber()
  days?: number;
}
