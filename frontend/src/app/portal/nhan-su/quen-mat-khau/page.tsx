'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { CheckCircle2, ShieldCheck } from 'lucide-react';
import { StaffAuthShell } from '@/components/staff-auth-shell';
import { StaffPasswordField } from '@/components/staff-password-field';
import {
  requestStaffPasswordResetOtpRequest,
  resetStaffPasswordWithOtpRequest,
  StaffPasswordResetOtpRequestResult,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';

export default function StaffForgotPasswordPage() {
  const { locale } = useI18n();
  const [email, setEmail] = useState('');
  const [challenge, setChallenge] = useState<StaffPasswordResetOtpRequestResult | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [clock, setClock] = useState(() => Date.now());

  useEffect(() => {
    if (!challenge || success) return;
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [challenge, success]);

  const resendSeconds = challenge
    ? Math.max(0, Math.ceil((new Date(challenge.resendAvailableAt).getTime() - clock) / 1000))
    : 0;
  const expirySeconds = challenge
    ? Math.max(0, Math.ceil((new Date(challenge.expiresAt).getTime() - clock) / 1000))
    : 0;

  async function requestOtp(event?: FormEvent) {
    event?.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return;

    event ? setLoading(true) : setResending(true);
    setError('');
    try {
      const result = await requestStaffPasswordResetOtpRequest(normalizedEmail);
      setEmail(normalizedEmail);
      setChallenge(result);
      setClock(Date.now());
      setOtpCode(result.debugCode || '');
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : '';
      setError(
        /too many|try again|thử lại|wait/i.test(message)
          ? locale === 'vi'
            ? 'Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau.'
            : 'Too many requests. Please try again later.'
          : locale === 'vi'
            ? 'Không thể gửi yêu cầu lúc này. Vui lòng thử lại.'
            : 'The request could not be completed. Please try again.',
      );
    } finally {
      setLoading(false);
      setResending(false);
    }
  }

  async function resetPassword(event: FormEvent) {
    event.preventDefault();
    if (!challenge) return;
    if (!/^\d{6}$/.test(otpCode)) {
      setError(locale === 'vi' ? 'Mã OTP phải gồm đúng 6 chữ số.' : 'OTP must contain exactly 6 digits.');
      return;
    }
    if (newPassword.length < 12) {
      setError(locale === 'vi' ? 'Mật khẩu cần ít nhất 12 ký tự.' : 'Password must be at least 12 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(locale === 'vi' ? 'Mật khẩu xác nhận không khớp.' : 'Password confirmation does not match.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await resetStaffPasswordWithOtpRequest({
        email,
        requestId: challenge.requestId,
        otpCode,
        newPassword,
        confirmPassword,
      });
      setSuccess(true);
      setOtpCode('');
      setNewPassword('');
      setConfirmPassword('');
    } catch {
      setError(
        locale === 'vi'
          ? 'Mã OTP không hợp lệ, đã hết hạn hoặc mật khẩu chưa đáp ứng yêu cầu.'
          : 'The OTP is invalid or expired, or the password does not meet requirements.',
      );
    } finally {
      setLoading(false);
    }
  }

  function changeEmail() {
    setChallenge(null);
    setOtpCode('');
    setNewPassword('');
    setConfirmPassword('');
    setError('');
  }

  return (
    <StaffAuthShell
      title={locale === 'vi' ? 'Khôi phục mật khẩu nhân sự' : 'Recover staff password'}
      description={
        locale === 'vi'
          ? 'Xác minh tài khoản nội bộ bằng mã OTP gửi qua Zalo, sau đó đặt mật khẩu mới.'
          : 'Verify your internal account with a Zalo OTP, then set a new password.'
      }
    >
      {success ? (
        <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">
          <CheckCircle2 className="h-6 w-6" />
          <p className="mt-3 font-semibold">
            {locale === 'vi' ? 'Mật khẩu đã được đặt lại' : 'Password reset complete'}
          </p>
          <p className="mt-2 text-sm leading-6 text-emerald-800">
            {locale === 'vi'
              ? 'Tất cả phiên đăng nhập cũ đã bị thu hồi. Bạn có thể đăng nhập bằng mật khẩu mới.'
              : 'All previous sessions were revoked. You can now sign in with the new password.'}
          </p>
          <Link href="/login?mode=staff" className="btn-dark mt-5 inline-flex min-h-12 items-center">
            {locale === 'vi' ? 'Đăng nhập nhân sự' : 'Staff login'}
          </Link>
        </div>
      ) : challenge ? (
        <form onSubmit={resetPassword} className="grid gap-5">
          <div className="rounded-[22px] border border-sky-200 bg-sky-50 p-4 text-sky-950">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold">{locale === 'vi' ? 'Kiểm tra Zalo của bạn' : 'Check your Zalo'}</p>
                <p className="mt-1 text-sm leading-6 text-sky-800">
                  {locale === 'vi'
                    ? 'Nếu tài khoản đủ điều kiện, mã OTP đã được gửi đến số điện thoại đăng ký. Mã có hiệu lực trong 5 phút.'
                    : 'If the account is eligible, an OTP was sent to its registered phone number. It is valid for 5 minutes.'}
                </p>
              </div>
            </div>
          </div>

          <label className="grid gap-2 text-sm font-medium text-slate-700">
            <span>{locale === 'vi' ? 'Mã OTP Zalo' : 'Zalo OTP'}</span>
            <input
              className="field min-h-12 tracking-[0.3em]"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              maxLength={6}
              value={otpCode}
              onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
            />
          </label>

          {challenge.debugCode ? (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {locale === 'vi' ? 'Mã local dry-run:' : 'Local dry-run code:'} {challenge.debugCode}
            </p>
          ) : null}

          <StaffPasswordField
            label={locale === 'vi' ? 'Mật khẩu mới' : 'New password'}
            value={newPassword}
            onChange={setNewPassword}
            autoComplete="new-password"
          />
          <StaffPasswordField
            label={locale === 'vi' ? 'Xác nhận mật khẩu mới' : 'Confirm new password'}
            value={confirmPassword}
            onChange={setConfirmPassword}
            autoComplete="new-password"
          />
          <p className="text-xs leading-5 text-slate-500">
            {locale === 'vi'
              ? `Dùng ít nhất 12 ký tự. Mã OTP còn hiệu lực khoảng ${Math.ceil(expirySeconds / 60)} phút.`
              : `Use at least 12 characters. The OTP remains valid for about ${Math.ceil(expirySeconds / 60)} minutes.`}
          </p>
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          <button type="submit" className="btn-dark min-h-12" disabled={loading || expirySeconds <= 0}>
            {loading
              ? locale === 'vi'
                ? 'Đang cập nhật...'
                : 'Updating...'
              : locale === 'vi'
                ? 'Xác minh và đặt mật khẩu'
                : 'Verify and reset password'}
          </button>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <button
              type="button"
              className="font-semibold text-slate-600 underline decoration-slate-300 underline-offset-4 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={resending || resendSeconds > 0}
              onClick={() => requestOtp()}
            >
              {resending
                ? locale === 'vi'
                  ? 'Đang gửi lại...'
                  : 'Resending...'
                : resendSeconds > 0
                  ? locale === 'vi'
                    ? `Gửi lại sau ${resendSeconds}s`
                    : `Resend in ${resendSeconds}s`
                  : locale === 'vi'
                    ? 'Gửi lại OTP'
                    : 'Resend OTP'}
            </button>
            <button
              type="button"
              className="font-semibold text-slate-600 underline decoration-slate-300 underline-offset-4"
              onClick={changeEmail}
            >
              {locale === 'vi' ? 'Đổi email' : 'Change email'}
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={requestOtp} className="grid gap-5">
          <label className="grid gap-2 text-sm font-medium text-slate-700">
            <span>{locale === 'vi' ? 'Email công việc' : 'Work email'}</span>
            <input
              className="field min-h-12"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <p className="text-xs leading-5 text-slate-500">
            {locale === 'vi'
              ? 'Super Admin, Admin, Manager và Staff đều xác minh bằng số điện thoại đã đăng ký.'
              : 'Super Admin, Admin, Manager and Staff all verify with their registered phone number.'}
          </p>
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          <button type="submit" className="btn-dark min-h-12" disabled={loading}>
            {loading
              ? locale === 'vi'
                ? 'Đang gửi OTP...'
                : 'Sending OTP...'
              : locale === 'vi'
                ? 'Gửi OTP qua Zalo'
                : 'Send Zalo OTP'}
          </button>
        </form>
      )}

      {!success ? (
        <Link
          href="/login?mode=staff"
          className="mt-6 inline-flex text-sm font-semibold text-slate-600 underline decoration-slate-300 underline-offset-4 hover:text-slate-950"
        >
          {locale === 'vi' ? 'Quay lại đăng nhập nhân sự' : 'Back to staff login'}
        </Link>
      ) : null}
    </StaffAuthShell>
  );
}
