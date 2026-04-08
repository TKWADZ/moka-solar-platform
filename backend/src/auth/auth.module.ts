import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ZaloNotificationsModule } from '../zalo-notifications/zalo-notifications.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { OTP_PROVIDER } from './otp/otp-provider.interface';
import { ZaloOtpProvider } from './otp/zalo-otp.provider';

@Module({
  imports: [
    PassportModule,
    ZaloNotificationsModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'super_secret_key',
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    ZaloOtpProvider,
    {
      provide: OTP_PROVIDER,
      useExisting: ZaloOtpProvider,
    },
  ],
  exports: [AuthService],
})
export class AuthModule {}
