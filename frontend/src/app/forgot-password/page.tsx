'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, KeyRound, ShieldCheck, Smartphone } from 'lucide-react';
import { LanguageSwitcher } from '@/components/language-switcher';
import { requestPasswordResetOtpRequest, resetPasswordWithOtpRequest } from '@/lib/api';
import { getDefaultRouteForRole, getSession, saveSession } from '@/lib/auth';

function normalizeVietnamPhoneCandidate(value: string) {
  const raw = value.trim();
  if (!raw) {
    return null;
  }

  let digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) {
    digits = digits.slice(1);
  }

  digits = digits.replace(/\D/g, '');
  if (!digits) {
    return null;
  }

  if (digits.startsWith('84')) {
    digits = `84${digits.slice(2).replace(/^0+/, '')}`;
  } else if (digits.startsWith('0')) {
    digits = `84${digits.slice(1)}`;
  }

  return /^84\d{8,11}$/.test(digits) ? digits : null;
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return null;
  }

  try {
    return new Intl.DateTimeFormat('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export default function ForgotPasswordPage() {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [requestId, setRequestId] = useState('');
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [resendAvailableAt, setResendAvailableAt] = useState<string | null>(null);
  const [debugCode, setDebugCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hint, setHint] = useState('');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const session = getSession();
    if (session) {
      window.location.replace(getDefaultRouteForRole(session.user.role));
    }
  }, []);

  useEffect(() => {
    if (!resendAvailableAt && !expiresAt) {
      return undefined;
    }

    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [resendAvailableAt, expiresAt]);

  const normalizedPhone = useMemo(() => normalizeVietnamPhoneCandidate(phone), [phone]);
  const resendRemainingSeconds = useMemo(() => {
    if (!resendAvailableAt) {
      return 0;
    }

    const remaining = new Date(resendAvailableAt).getTime() - now;
    return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
  }, [now, resendAvailableAt]);

  async function handleRequestOtp(event?: React.SyntheticEvent) {
    event?.preventDefault();

    if (!normalizedPhone) {
      setError('Vui lòng nhập số điện thoại Việt Nam hợp lệ.');
      return;
    }

    if (password.trim().length < 6) {
      setError('Mật khẩu mới cần ít nhất 6 ký tự.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Mật khẩu xác nhận chưa khớp.');
      return;
    }

    setLoading(true);
    setError('');
    setHint('');

    try {
      const result = await requestPasswordResetOtpRequest(normalizedPhone);
      setRequestId(result.requestId);
      setExpiresAt(result.expiresAt);
      setResendAvailableAt(result.resendAvailableAt);
      setDebugCode(result.debugCode || null);
      setHint(
        result.phonePreview
          ? `Mã OTP đã được gửi tới ${result.phonePreview}.`
          : 'Mã OTP đã được gửi thành công.',
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Không thể gửi mã OTP. Vui lòng thử lại.',
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword(event: React.FormEvent) {
    event.preventDefault();

    if (!normalizedPhone) {
      setError('Vui lòng nhập số điện thoại Việt Nam hợp lệ.');
      return;
    }

    if (!requestId) {
      setError('Vui lòng yêu cầu OTP trước khi đặt lại mật khẩu.');
      return;
    }

    if (!otpCode.trim()) {
      setError('Vui lòng nhập mã OTP 6 chữ số.');
      return;
    }

    setLoading(true);
    setError('');
    setHint('');

    try {
      const session = await resetPasswordWithOtpRequest({
        phone: normalizedPhone,
        otpCode: otpCode.trim(),
        requestId,
        password,
      });
      saveSession(session);
      window.location.href = getDefaultRouteForRole(session.user.role);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Không thể đặt lại mật khẩu. Vui lòng thử lại.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="shell flex min-h-screen items-center justify-center py-12">
      <div className="surface-card-strong w-full max-w-3xl p-8">
        <div className="flex items-center justify-between gap-4">
          <p className="eyebrow text-slate-500">Quên mật khẩu khách hàng</p>
          <LanguageSwitcher />
        </div>

        <div className="mt-4">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 transition hover:text-slate-950"
          >
            <ArrowLeft className="h-4 w-4" />
            Quay về đăng nhập
          </Link>
        </div>

        <div className="mt-5 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <h1 className="text-3xl font-semibold text-slate-950">
              Đặt lại mật khẩu bằng OTP Zalo
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Nhập số điện thoại khách hàng, nhận OTP qua Zalo, rồi tạo mật khẩu mới để tiếp tục sử
              dụng customer portal hằng ngày.
            </p>

            <form onSubmit={requestId ? handleResetPassword : handleRequestOtp} className="mt-8 grid gap-4">
              <input
                className="field"
                placeholder="Số điện thoại"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                inputMode="tel"
                autoComplete="tel"
              />
              <input
                className="field"
                placeholder="Mật khẩu mới"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
              />
              <input
                className="field"
                placeholder="Nhập lại mật khẩu mới"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
              />

              {requestId ? (
                <>
                  <input
                    className="field"
                    placeholder="Nhập mã OTP"
                    value={otpCode}
                    onChange={(event) => setOtpCode(event.target.value)}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                  />
                  <p className="text-xs leading-5 text-slate-500">
                    {expiresAt
                      ? `Mã còn hiệu lực đến ${formatDateTime(expiresAt)}.`
                      : 'Mã OTP có hiệu lực trong 5 phút.'}
                  </p>
                  {debugCode ? (
                    <p className="text-xs leading-5 text-amber-700">Debug local: {debugCode}</p>
                  ) : null}
                </>
              ) : null}

              {error ? <p className="text-sm text-rose-600">{error}</p> : null}
              {hint ? <p className="text-sm text-emerald-700">{hint}</p> : null}

              <div className="flex flex-wrap gap-3">
                <button className="btn-dark" disabled={loading}>
                  {loading
                    ? requestId
                      ? 'Đang đặt lại mật khẩu...'
                      : 'Đang gửi OTP...'
                    : requestId
                      ? 'Đặt lại mật khẩu'
                      : 'Nhận OTP qua Zalo'}
                </button>
                {requestId ? (
                  <button
                    type="button"
                    onClick={handleRequestOtp}
                    disabled={loading || resendRemainingSeconds > 0}
                    className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-900 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {resendRemainingSeconds > 0
                      ? `Gửi lại sau ${resendRemainingSeconds}s`
                      : 'Gửi lại OTP'}
                  </button>
                ) : null}
              </div>
            </form>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-slate-950 shadow-sm">
              <KeyRound className="h-6 w-6" />
            </div>
            <h2 className="mt-5 text-xl font-semibold text-slate-950">Bảo mật theo đúng mục đích</h2>
            <div className="mt-5 grid gap-3">
              {[
                {
                  icon: Smartphone,
                  title: 'OTP chỉ dùng khi cần xác minh',
                  body: 'Đăng nhập hằng ngày vẫn là số điện thoại + mật khẩu, OTP chỉ dùng cho các bước nhạy cảm.',
                },
                {
                  icon: ShieldCheck,
                  title: 'Mã có thời hạn và giới hạn thử',
                  body: 'OTP có hiệu lực 5 phút, mỗi yêu cầu chỉ tối đa 5 lần nhập sai.',
                },
                {
                  icon: KeyRound,
                  title: 'Đặt lại xong vào lại ngay',
                  body: 'Sau khi xác minh thành công, hệ thống tạo phiên đăng nhập mới cho khách hàng.',
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="rounded-[20px] border border-slate-200 bg-white px-4 py-4"
                >
                  <div className="flex items-center gap-3 text-slate-950">
                    <item.icon className="h-5 w-5" />
                    <div className="font-semibold">{item.title}</div>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
