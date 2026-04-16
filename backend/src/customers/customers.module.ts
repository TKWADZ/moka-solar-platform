import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
@Module({
  imports: [MediaModule],
  controllers: [CustomersController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
