import { Module } from '@nestjs/common';
import { ServicePackagesController } from './service-packages.controller';
import { ServicePackagesService } from './service-packages.service';

@Module({
  controllers: [ServicePackagesController],
  providers: [ServicePackagesService],
  exports: [ServicePackagesService],
})
export class ServicePackagesModule {}
