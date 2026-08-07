'use client';

import { FormEvent, useState } from 'react';
import { CheckCircle2, ShieldCheck } from 'lucide-react';
import { SectionCard } from '@/components/section-card';
import { StaffPasswordField } from '@/components/staff-password-field';
import { changeStaffPasswordRequest } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

export default function AdminSecurityPage() {
  const { locale } = useI18n();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (newPassword.length < 12) {
      setError(locale === 'vi' ? 'Mật khẩu mới cần ít nhất 12 ký tự.' : 'New password must be at least 12 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(locale === 'vi' ? 'Mật khẩu xác nhận không khớp.' : 'Password confirmation does not match.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const result = await changeStaffPasswordRequest({
        currentPassword,
        newPassword,
        confirmPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccess(
        locale === 'vi'
          ? result.message
          : 'Password changed. Other active sessions have been revoked.',
      );
    } catch (requestError) {
      setError(
        locale === 'vi' && requestError instanceof Error
          ? requestError.message
          : locale === 'vi'
            ? 'Không thể đổi mật khẩu lúc này.'
            : 'Password could not be changed. Check the current password and requirements.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
      <SectionCard dark eyebrow="Bảo mật tài khoản" title={locale === 'vi' ? 'Đổi mật khẩu' : 'Change password'}>
        <form onSubmit={submit} className="grid max-w-2xl gap-5">
          <StaffPasswordField
            dark
            label={locale === 'vi' ? 'Mật khẩu hiện tại' : 'Current password'}
            value={currentPassword}
            onChange={setCurrentPassword}
            autoComplete="current-password"
          />
          <StaffPasswordField
            dark
            label={locale === 'vi' ? 'Mật khẩu mới' : 'New password'}
            value={newPassword}
            onChange={setNewPassword}
            autoComplete="new-password"
          />
          <StaffPasswordField
            dark
            label={locale === 'vi' ? 'Xác nhận mật khẩu mới' : 'Confirm new password'}
            value={confirmPassword}
            onChange={setConfirmPassword}
            autoComplete="new-password"
          />

          <p className="text-sm leading-6 text-slate-400">
            {locale === 'vi'
              ? 'Tối thiểu 12 ký tự. Sau khi đổi, các phiên đăng nhập khác sẽ bị thu hồi; cấu hình 2FA không thay đổi.'
              : 'Use at least 12 characters. Other sessions will be revoked; 2FA settings remain unchanged.'}
          </p>
          {error ? <p className="rounded-2xl border border-rose-300/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{error}</p> : null}
          {success ? (
            <p className="flex items-start gap-2 rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              {success}
            </p>
          ) : null}
          <button type="submit" className="btn-primary min-h-12 w-full sm:w-fit" disabled={loading}>
            {loading
              ? locale === 'vi'
                ? 'Đang cập nhật...'
                : 'Updating...'
              : locale === 'vi'
                ? 'Lưu mật khẩu mới'
                : 'Save new password'}
          </button>
        </form>
      </SectionCard>

      <SectionCard dark eyebrow="Phiên đăng nhập" title={locale === 'vi' ? 'Bảo vệ tài khoản' : 'Account protection'}>
        <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
          <ShieldCheck className="h-6 w-6 text-emerald-300" />
          <p className="mt-4 text-sm leading-7 text-slate-300">
            {locale === 'vi'
              ? 'Mật khẩu được băm bằng bcrypt. Thao tác đổi hoặc đặt lại mật khẩu được ghi audit và không làm thay đổi role hay cấu hình MFA.'
              : 'Passwords are hashed with bcrypt. Password changes are audited and never alter roles or MFA configuration.'}
          </p>
        </div>
      </SectionCard>
    </div>
  );
}
