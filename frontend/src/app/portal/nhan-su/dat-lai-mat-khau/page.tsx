'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { StaffAuthShell } from '@/components/staff-auth-shell';
import { StaffPasswordField } from '@/components/staff-password-field';
import { resetStaffPasswordRequest } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

export default function StaffResetPasswordPage() {
  const { locale } = useI18n();
  const [token, setToken] = useState('');
  const [tokenReady, setTokenReady] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get('token') || '');
    setTokenReady(true);
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
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
      await resetStaffPasswordRequest({ token, newPassword, confirmPassword });
      setSuccess(true);
      setNewPassword('');
      setConfirmPassword('');
    } catch {
      setError(
        locale === 'vi'
          ? 'Liên kết không hợp lệ, đã hết hạn hoặc mật khẩu chưa đáp ứng yêu cầu.'
          : 'The link is invalid or expired, or the password does not meet requirements.',
      );
    } finally {
      setLoading(false);
    }
  }

  const invalidLink = tokenReady && token.length < 32;

  return (
    <StaffAuthShell
      title={locale === 'vi' ? 'Đặt lại mật khẩu' : 'Reset password'}
      description={
        locale === 'vi'
          ? 'Liên kết chỉ dùng được một lần và hết hạn sau 20 phút.'
          : 'This link can be used once and expires after 20 minutes.'
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
      ) : invalidLink ? (
        <div className="rounded-[24px] border border-rose-200 bg-rose-50 p-5 text-sm leading-6 text-rose-800">
          {locale === 'vi'
            ? 'Liên kết đặt lại mật khẩu không hợp lệ. Hãy yêu cầu một liên kết mới.'
            : 'This reset link is invalid. Request a new link.'}
        </div>
      ) : (
        <form onSubmit={submit} className="grid gap-5">
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
              ? 'Dùng ít nhất 12 ký tự. Hệ thống hỗ trợ mật khẩu dài và passphrase.'
              : 'Use at least 12 characters. Long passwords and passphrases are supported.'}
          </p>
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          <button type="submit" className="btn-dark min-h-12" disabled={loading || !tokenReady}>
            {loading
              ? locale === 'vi'
                ? 'Đang cập nhật...'
                : 'Updating...'
              : locale === 'vi'
                ? 'Đặt lại mật khẩu'
                : 'Reset password'}
          </button>
        </form>
      )}

      {!success ? (
        <Link
          href="/portal/nhan-su/quen-mat-khau"
          className="mt-6 inline-flex text-sm font-semibold text-slate-600 underline decoration-slate-300 underline-offset-4 hover:text-slate-950"
        >
          {locale === 'vi' ? 'Yêu cầu liên kết mới' : 'Request a new link'}
        </Link>
      ) : null}
    </StaffAuthShell>
  );
}
