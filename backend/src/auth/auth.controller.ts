import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RequestLoginOtpDto } from './dto/request-login-otp.dto';
import { VerifyLoginOtpDto } from './dto/verify-login-otp.dto';
import { RequestRegisterOtpDto } from './dto/request-register-otp.dto';
import { VerifyRegisterOtpDto } from './dto/verify-register-otp.dto';
import { RequestPasswordResetOtpDto } from './dto/request-password-reset-otp.dto';
import { ResetPasswordWithOtpDto } from './dto/reset-password-with-otp.dto';
import { StaffForgotPasswordDto } from './dto/staff-forgot-password.dto';
import { StaffResetPasswordDto } from './dto/staff-reset-password.dto';
import { StaffChangePasswordDto } from './dto/staff-change-password.dto';
import { StaffPasswordService } from './staff-password.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user.type';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly staffPasswordService: StaffPasswordService,
  ) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('login-otp/request')
  requestLoginOtp(@Body() dto: RequestLoginOtpDto) {
    return this.authService.requestLoginOtp(dto);
  }

  @Post('login-otp/verify')
  verifyLoginOtp(@Body() dto: VerifyLoginOtpDto) {
    return this.authService.verifyLoginOtp(dto);
  }

  @Post('register-otp/request')
  requestRegisterOtp(@Body() dto: RequestRegisterOtpDto) {
    return this.authService.requestRegisterOtp(dto);
  }

  @Post('register-otp/verify')
  verifyRegisterOtp(@Body() dto: VerifyRegisterOtpDto) {
    return this.authService.verifyRegisterOtp(dto);
  }

  @Post('password-reset/request')
  requestPasswordResetOtp(@Body() dto: RequestPasswordResetOtpDto) {
    return this.authService.requestPasswordResetOtp(dto);
  }

  @Post('password-reset/verify')
  resetPasswordWithOtp(@Body() dto: ResetPasswordWithOtpDto) {
    return this.authService.resetPasswordWithOtp(dto);
  }

  @Post('staff/forgot-password')
  requestStaffPasswordReset(@Body() dto: StaffForgotPasswordDto) {
    return this.staffPasswordService.requestPasswordReset(dto.email);
  }

  @Post('staff/reset-password')
  resetStaffPassword(@Body() dto: StaffResetPasswordDto) {
    return this.staffPasswordService.resetPassword(dto);
  }

  @Post('staff/change-password')
  @UseGuards(JwtAuthGuard)
  changeStaffPassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: StaffChangePasswordDto,
  ) {
    return this.staffPasswordService.changePassword({
      userId: user.sub,
      sessionId: user.sid,
      ...dto,
    });
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  logout(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.logout(user.sub, user.sid);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.me(user.sub);
  }
}
