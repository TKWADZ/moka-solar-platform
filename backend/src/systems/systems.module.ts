import { Module } from '@nestjs/common';
import { DeyeConnectionsModule } from '../deye-connections/deye-connections.module';
import { SystemsController } from './systems.controller';
import { SystemsService } from './systems.service';
@Module({
  imports: [DeyeConnectionsModule],
  controllers: [SystemsController],
  providers: [SystemsService],
})
export class SystemsModule {}
