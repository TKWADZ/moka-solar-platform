import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ZaloNotificationsModule } from '../zalo-notifications/zalo-notifications.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { OTP_PROVIDER } from './otp/otp-provider.interface';
import { ZaloOtpProvider } from './otp/zalo-otp.provider';
import { StaffPasswordService } from './staff-password.service';
import { STAFF_MAIL_PROVIDER } from './mail/staff-mail-provider.interface';
import { SmtpStaffMailProvider } from './mail/smtp-staff-mail.provider';

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
    StaffPasswordService,
    SmtpStaffMailProvider,
    JwtStrategy,
    ZaloOtpProvider,
    {
      provide: OTP_PROVIDER,
      useExisting: ZaloOtpProvider,
    },
    {
      provide: STAFF_MAIL_PROVIDER,
      useExisting: SmtpStaffMailProvider,
    },
  ],
  exports: [AuthService],
})
export class AuthModule {}
