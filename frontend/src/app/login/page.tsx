'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  LockKeyhole,
  MessageSquareText,
  ShieldCheck,
  Smartphone,
  SunMedium,
  UserRound,
} from 'lucide-react';
import { LanguageSwitcher } from '@/components/language-switcher';
import {
  loginRequest,
  requestLoginOtpRequest,
  verifyLoginOtpRequest,
} from '@/lib/api';
import { getDefaultRouteForRole, getSession, saveSession } from '@/lib/auth';
import { UserRole } from '@/types';

const SAMPLE_ACCOUNTS_ENABLED = process.env.NEXT_PUBLIC_ENABLE_SAMPLE_ACCOUNTS === 'true';
const SELF_REGISTER_ENABLED = process.env.NEXT_PUBLIC_ENABLE_SELF_REGISTER === 'true';

const sampleAccounts = [
  {
    role: 'SUPER_ADMIN' as UserRole,
    label: 'Super Admin',
    description: 'Toàn quyền cấu hình hệ thống và bảo mật.',
    email: process.env.NEXT_PUBLIC_SAMPLE_SUPERADMIN_EMAIL || '',
    password: process.env.NEXT_PUBLIC_SAMPLE_SUPERADMIN_PASSWORD || '',
  },
  {
    role: 'ADMIN' as UserRole,
    label: 'Admin',
    description: 'Điều phối vận hành, billing và integrations.',
    email: process.env.NEXT_PUBLIC_SAMPLE_ADMIN_EMAIL || '',
    password: process.env.NEXT_PUBLIC_SAMPLE_ADMIN_PASSWORD || '',
  },
  {
    role: 'MANAGER' as UserRole,
    label: 'Manager',
    description: 'Quản lý vận hành, khách hàng và hợp đồng.',
    email: process.env.NEXT_PUBLIC_SAMPLE_MANAGER_EMAIL || '',
    password: process.env.NEXT_PUBLIC_SAMPLE_MANAGER_PASSWORD || '',
  },
].filter((account) => Boolean(account.email && account.password));

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

export default function LoginPage() {
  const [mode, setMode] = useState<'CUSTOMER' | 'INTERNAL'>('CUSTOMER');
  const [customerPhone, setCustomerPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpRequestId, setOtpRequestId] = useState('');
  const [otpExpiresAt, setOtpExpiresAt] = useState<string | null>(null);
  const [otpResendAvailableAt, setOtpResendAvailableAt] = useState<string | null>(null);
  const [otpDebugCode, setOtpDebugCode] = useState<string | null>(null);
  const [internalEmail, setInternalEmail] = useState('');
  const [internalPassword, setInternalPassword] = useState('');
  const [loadingCustomer, setLoadingCustomer] = useState(false);
  const [loadingInternal, setLoadingInternal] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState('');
  const [hint, setHint] = useState('');

  useEffect(() => {
    const session = getSession();
    if (session) {
      window.location.replace(getDefaultRouteForRole(session.user.role));
    }
  }, []);

  useEffect(() => {
    setOtpRequestId('');
    setOtpExpiresAt(null);
    setOtpResendAvailableAt(null);
    setOtpDebugCode(null);
    setOtpCode('');
    setError('');
    setHint('');
  }, [customerPhone]);

  useEffect(() => {
    if (!otpResendAvailableAt && !otpExpiresAt) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, [otpResendAvailableAt, otpExpiresAt]);

  const normalizedCustomerPhone = useMemo(
    () => normalizeVietnamPhoneCandidate(customerPhone),
    [customerPhone],
  );

  const resendRemainingSeconds = useMemo(() => {
    if (!otpResendAvailableAt) {
      return 0;
    }

    const remaining = new Date(otpResendAvailableAt).getTime() - now;
    return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
  }, [now, otpResendAvailableAt]);

  const otpExpiresLabel = formatDateTime(otpExpiresAt);

  async function handleCustomerRequestOtp() {
    if (!normalizedCustomerPhone) {
      setError('Vui lòng nhập số điện thoại khách hàng hợp lệ.');
      return;
    }

    setLoadingCustomer(true);
    setError('');
    setHint('');

    try {
      const result = await requestLoginOtpRequest(normalizedCustomerPhone);
      setOtpRequestId(result.requestId);
      setOtpExpiresAt(result.expiresAt);
      setOtpResendAvailableAt(result.resendAvailableAt);
      setOtpDebugCode(result.debugCode || null);
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
      setLoadingCustomer(false);
    }
  }

  async function handleCustomerVerifyOtp(event: React.FormEvent) {
    event.preventDefault();

    if (!normalizedCustomerPhone) {
      setError('Vui lòng nhập số điện thoại khách hàng hợp lệ.');
      return;
    }

    if (!otpRequestId) {
      setError('Vui lòng yêu cầu mã OTP trước khi xác thực.');
      return;
    }

    if (!otpCode.trim()) {
      setError('Vui lòng nhập mã OTP 6 chữ số.');
      return;
    }

    setLoadingCustomer(true);
    setError('');
    setHint('');

    try {
      const session = await verifyLoginOtpRequest(
        normalizedCustomerPhone,
        otpCode.trim(),
        otpRequestId,
      );
      saveSession(session);
      window.location.href = getDefaultRouteForRole(session.user.role);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Không thể xác thực OTP. Vui lòng thử lại.',
      );
    } finally {
      setLoadingCustomer(false);
    }
  }

  async function handleInternalLogin(event: React.FormEvent) {
    event.preventDefault();

    if (!internalEmail.trim() || !internalPassword.trim()) {
      setError('Vui lòng nhập email và mật khẩu để tiếp tục.');
      return;
    }

    setLoadingInternal(true);
    setError('');
    setHint('');

    try {
      const session = await loginRequest(internalEmail.trim(), internalPassword);
      saveSession(session);
      window.location.href = getDefaultRouteForRole(session.user.role);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Không thể đăng nhập bằng email. Vui lòng kiểm tra lại thông tin.',
      );
    } finally {
      setLoadingInternal(false);
    }
  }

  function applySample(role: UserRole) {
    const sample = sampleAccounts.find((account) => account.role === role);
    if (!sample) {
      return;
    }

    setMode('INTERNAL');
    setInternalEmail(sample.email);
    setInternalPassword(sample.password);
    setError('');
    setHint(`Đã điền sẵn tài khoản mẫu ${sample.label.toLowerCase()}.`);
  }

  const customerSteps = [
    'Nhập số điện thoại đã đăng ký với Moka Solar.',
    'Nhận OTP qua Zalo và xác thực trong 5 phút.',
    'Vào portal để xem sản lượng, hóa đơn và hỗ trợ.',
  ];

  const customerHighlights = [
    {
      icon: SunMedium,
      title: 'Sản lượng và trạng thái hệ thống',
      body: 'Theo dõi điện mặt trời, kỳ dữ liệu mới nhất và hỗ trợ vận hành.',
    },
    {
      icon: MessageSquareText,
      title: 'Hóa đơn và thanh toán',
      body: 'Xem tiền điện, hạn thanh toán và thông tin chuyển khoản ngay trong portal.',
    },
    {
      icon: ShieldCheck,
      title: 'Đăng nhập an toàn',
      body: 'Mỗi lần truy cập dùng OTP riêng, không cần ghi nhớ mật khẩu.',
    },
  ];

  return (
    <main className="shell min-h-screen py-6 sm:py-10 lg:flex lg:items-center">
      <div className="grid w-full gap-5 lg:grid-cols-[1.04fr_0.96fr] lg:gap-6">
        <div className="surface-card-strong order-2 p-5 sm:p-8 lg:order-1 lg:p-10">
          <div className="flex items-center justify-between gap-4">
            <p className="eyebrow text-slate-500">Cổng truy cập Moka Solar</p>
            <LanguageSwitcher />
          </div>

          <div className="mt-4">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 transition hover:text-slate-950"
            >
              <ArrowLeft className="h-4 w-4" />
              Quay về trang chủ
            </Link>
          </div>

          <div className="mt-6 inline-flex rounded-full border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => {
                setMode('CUSTOMER');
                setError('');
                setHint('');
              }}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                mode === 'CUSTOMER'
                  ? 'bg-slate-950 text-white'
                  : 'text-slate-600 hover:text-slate-950'
              }`}
            >
              Khách hàng
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('INTERNAL');
                setError('');
                setHint('');
              }}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                mode === 'INTERNAL'
                  ? 'bg-slate-950 text-white'
                  : 'text-slate-600 hover:text-slate-950'
              }`}
            >
              Nhân sự
            </button>
          </div>

          {mode === 'CUSTOMER' ? (
            <div className="mt-6">
              <h1 className="text-3xl font-semibold text-slate-950 sm:text-[2.2rem]">
                Đăng nhập khách hàng bằng số điện thoại
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Nhập số điện thoại đã đăng ký với hợp đồng hoặc hồ sơ khách hàng. Mã OTP sẽ
                được gửi qua Zalo để bạn vào portal an toàn.
              </p>

              <div className="mt-6 grid gap-3 rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                {customerSteps.map((step) => (
                  <div
                    key={step}
                    className="rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700"
                  >
                    {step}
                  </div>
                ))}
              </div>

              <form onSubmit={handleCustomerVerifyOtp} className="mt-8 grid gap-4">
                <label className="grid gap-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                    Số điện thoại
                  </span>
                  <input
                    className="field"
                    placeholder="Ví dụ 0912345678"
                    value={customerPhone}
                    onChange={(event) => setCustomerPhone(event.target.value)}
                    inputMode="tel"
                    autoComplete="tel"
                  />
                </label>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleCustomerRequestOtp}
                    className="btn-dark"
                    disabled={loadingCustomer || resendRemainingSeconds > 0}
                  >
                    {loadingCustomer
                      ? 'Đang gửi OTP...'
                      : resendRemainingSeconds > 0
                        ? `Gửi lại sau ${resendRemainingSeconds}s`
                        : 'Nhận mã OTP qua Zalo'}
                  </button>
                  {SELF_REGISTER_ENABLED ? (
                    <Link
                      href="/register"
                      className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-900 hover:text-slate-950"
                    >
                      Chưa có tài khoản?
                    </Link>
                  ) : null}
                </div>

                <label className="grid gap-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                    Mã OTP
                  </span>
                  <input
                    className="field"
                    placeholder="Nhập 6 chữ số"
                    value={otpCode}
                    onChange={(event) => setOtpCode(event.target.value)}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                  />
                  <span className="text-xs leading-5 text-slate-500">
                    {otpExpiresLabel
                      ? `Mã còn hiệu lực đến ${otpExpiresLabel}.`
                      : 'OTP có hiệu lực trong 5 phút kể từ lúc gửi.'}
                  </span>
                  {otpDebugCode ? (
                    <span className="text-xs leading-5 text-amber-700">
                      Debug local: {otpDebugCode}
                    </span>
                  ) : null}
                </label>

                {error ? <p className="text-sm text-rose-600">{error}</p> : null}
                {hint ? <p className="text-sm text-emerald-700">{hint}</p> : null}

                <button className="btn-dark" disabled={loadingCustomer}>
                  {loadingCustomer ? 'Đang xác thực...' : 'Xác thực OTP và vào portal'}
                </button>
              </form>
            </div>
          ) : (
            <div className="mt-6">
              <h1 className="text-3xl font-semibold text-slate-950 sm:text-[2.2rem]">
                Đăng nhập nội bộ bằng email
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Dành cho Super Admin, Admin, Manager và Staff. Đăng nhập bằng email và mật
                khẩu, sẵn sàng để bổ sung TOTP 2FA ở bước tiếp theo.
              </p>

              <form onSubmit={handleInternalLogin} className="mt-8 grid gap-4">
                <label className="grid gap-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                    Email
                  </span>
                  <input
                    className="field"
                    placeholder="you@mokasolar.com"
                    value={internalEmail}
                    onChange={(event) => setInternalEmail(event.target.value)}
                    autoComplete="email"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                    Mật khẩu
                  </span>
                  <input
                    className="field"
                    placeholder="Nhập mật khẩu"
                    type="password"
                    value={internalPassword}
                    onChange={(event) => setInternalPassword(event.target.value)}
                    autoComplete="current-password"
                  />
                </label>

                {SAMPLE_ACCOUNTS_ENABLED && sampleAccounts.length ? (
                  <div className="grid gap-3 md:grid-cols-3">
                    {sampleAccounts.map((account) => (
                      <button
                        key={account.role}
                        type="button"
                        onClick={() => applySample(account.role)}
                        className="rounded-[20px] border border-slate-200 bg-white px-4 py-4 text-left transition hover:border-slate-300 hover:shadow-sm"
                      >
                        <p className="font-semibold text-slate-950">{account.label}</p>
                        <p className="mt-1 text-sm leading-6 text-slate-600">
                          {account.description}
                        </p>
                      </button>
                    ))}
                  </div>
                ) : null}

                {error ? <p className="text-sm text-rose-600">{error}</p> : null}
                {hint ? <p className="text-sm text-emerald-700">{hint}</p> : null}

                <button className="btn-dark" disabled={loadingInternal}>
                  {loadingInternal ? 'Đang đăng nhập...' : 'Đăng nhập nội bộ'}
                </button>
              </form>
            </div>
          )}
        </div>

        <aside className="surface-card-strong order-1 overflow-hidden p-5 sm:p-8 lg:order-2 lg:p-10">
          <div className="flex items-center gap-3 text-sm font-semibold text-slate-600">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-white">
              <SunMedium className="h-5 w-5" />
            </div>
            Cổng khách hàng điện mặt trời
          </div>

          <div className="mt-6 space-y-4">
            <p className="eyebrow text-slate-500">Sau khi đăng nhập</p>
            <h2 className="text-3xl font-semibold leading-tight text-slate-950">
              Theo dõi sản lượng, hóa đơn và hỗ trợ vận hành trong cùng một nơi.
            </h2>
            <p className="text-sm leading-7 text-slate-600">
              Moka Solar dùng đăng nhập theo đúng ngữ cảnh sử dụng: khách hàng xác thực bằng
              số điện thoại và OTP, còn đội vận hành truy cập bằng email nội bộ.
            </p>
          </div>

          <div className="mt-8 grid gap-4">
            {customerHighlights.map((item) => (
              <div
                key={item.title}
                className="rounded-[24px] border border-slate-200 bg-slate-50 p-5"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-slate-900 shadow-sm">
                    <item.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-base font-semibold text-slate-950">{item.title}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{item.body}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 rounded-[28px] border border-slate-200 bg-slate-950 p-5 text-white">
            <p className="eyebrow text-slate-400">Truy cập đúng vai trò</p>
            <div className="mt-4 grid gap-3">
              <div className="flex items-center gap-3 rounded-[18px] bg-white/5 px-4 py-3">
                <Smartphone className="h-5 w-5 text-amber-300" />
                <div>
                  <p className="font-semibold">Khách hàng</p>
                  <p className="text-sm text-slate-300">Số điện thoại + OTP Zalo</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-[18px] bg-white/5 px-4 py-3">
                <LockKeyhole className="h-5 w-5 text-emerald-300" />
                <div>
                  <p className="font-semibold">Admin / Manager / Staff</p>
                  <p className="text-sm text-slate-300">Email + mật khẩu, sẵn sàng cho 2FA</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-[18px] bg-white/5 px-4 py-3">
                <CheckCircle2 className="h-5 w-5 text-sky-300" />
                <div>
                  <p className="font-semibold">Dữ liệu sau khi vào cổng</p>
                  <p className="text-sm text-slate-300">
                    Sản lượng điện, hóa đơn, thanh toán và hỗ trợ vận hành.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 rounded-[24px] border border-slate-200 bg-white p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-900">
                {mode === 'CUSTOMER' ? (
                  <Smartphone className="h-5 w-5" />
                ) : mode === 'INTERNAL' ? (
                  <UserRound className="h-5 w-5" />
                ) : (
                  <KeyRound className="h-5 w-5" />
                )}
              </div>
              <div>
                <p className="font-semibold text-slate-950">
                  {mode === 'CUSTOMER'
                    ? 'Khách hàng đăng nhập bằng OTP'
                    : 'Nhân sự đăng nhập bằng email'}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {mode === 'CUSTOMER'
                    ? 'Luồng ưu tiên cho portal khách hàng: dùng đúng số điện thoại đã đăng ký, nhận OTP qua Zalo và truy cập ngay.'
                    : 'Luồng riêng cho vận hành nội bộ: email + mật khẩu, tách biệt khỏi customer auth để dễ kiểm soát bảo mật.'}
                </p>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
