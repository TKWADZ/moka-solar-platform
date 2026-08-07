'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { StaffAuthShell } from '@/components/staff-auth-shell';
import { requestStaffPasswordResetRequest } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

export default function StaffForgotPasswordPage() {
  const { locale } = useI18n();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      await requestStaffPasswordResetRequest(email.trim().toLowerCase());
      setSuccess(true);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : '';
      setError(
        /try again|thử lại/i.test(message)
          ? locale === 'vi'
            ? 'Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau.'
            : 'Too many requests. Please try again later.'
          : locale === 'vi'
            ? 'Không thể gửi yêu cầu lúc này. Vui lòng thử lại.'
            : 'The request could not be completed. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <StaffAuthShell
      title={locale === 'vi' ? 'Khôi phục mật khẩu nhân sự' : 'Recover staff password'}
      description={
        locale === 'vi'
          ? 'Nhập email công việc. Nếu tài khoản tồn tại, hệ thống sẽ gửi một liên kết dùng một lần.'
          : 'Enter your work email. If the account exists, a single-use link will be sent.'
      }
    >
      {success ? (
        <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">
          <CheckCircle2 className="h-6 w-6" />
          <p className="mt-3 font-semibold">
            {locale === 'vi' ? 'Hãy kiểm tra email của bạn' : 'Check your email'}
          </p>
          <p className="mt-2 text-sm leading-6 text-emerald-800">
            {locale === 'vi'
              ? 'Nếu email tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu đã được gửi.'
              : 'If the email exists in the system, password reset instructions have been sent.'}
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="grid gap-5">
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
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          <button type="submit" className="btn-dark min-h-12" disabled={loading}>
            {loading
              ? locale === 'vi'
                ? 'Đang gửi...'
                : 'Sending...'
              : locale === 'vi'
                ? 'Gửi hướng dẫn'
                : 'Send instructions'}
          </button>
        </form>
      )}

      <Link
        href="/login?mode=staff"
        className="mt-6 inline-flex text-sm font-semibold text-slate-600 underline decoration-slate-300 underline-offset-4 hover:text-slate-950"
      >
        {locale === 'vi' ? 'Quay lại đăng nhập nhân sự' : 'Back to staff login'}
      </Link>
    </StaffAuthShell>
  );
}
