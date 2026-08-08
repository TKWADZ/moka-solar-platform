import { Module } from '@nestjs/common';
import { SemsPlusClientService } from './sems-plus-client.service';
import { SemsPlusSessionManager } from './sems-plus-session.manager';

@Module({
  providers: [SemsPlusSessionManager, SemsPlusClientService],
  exports: [SemsPlusSessionManager, SemsPlusClientService],
})
export class SemsPlusModule {}
