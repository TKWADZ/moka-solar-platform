'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, ShieldCheck, Smartphone } from 'lucide-react';
import { LanguageSwitcher } from '@/components/language-switcher';
import {
  requestRegisterOtpRequest,
  verifyRegisterOtpRequest,
} from '@/lib/api';
import { getDefaultRouteForRole, getSession, saveSession } from '@/lib/auth';

const SELF_REGISTER_ENABLED = process.env.NEXT_PUBLIC_ENABLE_SELF_REGISTER === 'true';

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

export default function RegisterPage() {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
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
    setRequestId('');
    setExpiresAt(null);
    setResendAvailableAt(null);
    setDebugCode(null);
    setOtpCode('');
    setError('');
    setHint('');
  }, [fullName, phone, email]);

  useEffect(() => {
    if (!resendAvailableAt && !expiresAt) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

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

    if (!fullName.trim()) {
      setError('Vui lòng nhập họ và tên.');
      return;
    }

    if (!normalizedPhone) {
      setError('Vui lòng nhập số điện thoại Việt Nam hợp lệ.');
      return;
    }

    setLoading(true);
    setError('');
    setHint('');

    try {
      const result = await requestRegisterOtpRequest({
        fullName: fullName.trim(),
        phone: normalizedPhone,
        email: email.trim() || undefined,
      });

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

  async function handleVerifyOtp(event: React.FormEvent) {
    event.preventDefault();

    if (!normalizedPhone) {
      setError('Vui lòng nhập số điện thoại Việt Nam hợp lệ.');
      return;
    }

    if (!requestId) {
      setError('Vui lòng nhận mã OTP trước khi xác thực.');
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
      const session = await verifyRegisterOtpRequest({
        phone: normalizedPhone,
        otpCode: otpCode.trim(),
        requestId,
      });
      saveSession(session);
      window.location.href = getDefaultRouteForRole(session.user.role);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Không thể xác thực OTP. Vui lòng thử lại.',
      );
    } finally {
      setLoading(false);
    }
  }

  if (!SELF_REGISTER_ENABLED) {
    return (
      <main className="shell flex min-h-screen items-center justify-center py-12">
        <div className="surface-card-strong w-full max-w-2xl p-8">
          <div className="flex items-center justify-between gap-4">
            <p className="eyebrow text-slate-500">Yêu cầu cấp tài khoản</p>
            <LanguageSwitcher />
          </div>
          <h1 className="mt-3 text-3xl font-semibold text-slate-950">
            Tài khoản khách hàng được cấp sau khi hoàn tất onboarding
          </h1>
          <p className="mt-3 text-sm leading-7 text-slate-600">
            Moka Solar hiện chỉ mở tự đăng ký khi được bật cho từng giai đoạn vận hành. Khi
            cần, đội ngũ sẽ tạo hồ sơ và kích hoạt tài khoản khách hàng theo hợp đồng thực tế.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/contact" className="btn-dark">
              Liên hệ để được cấp tài khoản
            </Link>
            <Link
              href="/login"
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-900 hover:text-slate-950"
            >
              Tôi đã có tài khoản
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="shell flex min-h-screen items-center justify-center py-12">
      <div className="surface-card-strong w-full max-w-3xl p-8">
        <div className="flex items-center justify-between gap-4">
          <p className="eyebrow text-slate-500">Đăng ký khách hàng bằng OTP Zalo</p>
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

        <div className="mt-5 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <h1 className="text-3xl font-semibold text-slate-950">
              Tạo tài khoản khách hàng bằng số điện thoại
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Nhập thông tin cơ bản, nhận OTP qua Zalo và kích hoạt truy cập ngay cho customer
              portal.
            </p>

            <form onSubmit={requestId ? handleVerifyOtp : handleRequestOtp} className="mt-8 grid gap-4">
              <input
                className="field"
                placeholder="Họ và tên"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
              />
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
                placeholder="Email (không bắt buộc)"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
              />

              <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                OTP có hiệu lực trong 5 phút. Mỗi số điện thoại phải chờ 60 giây mới có thể
                gửi lại mã mới.
              </div>

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
                      ? 'Đang xác thực...'
                      : 'Đang gửi OTP...'
                    : requestId
                      ? 'Xác thực và tạo tài khoản'
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
              <Smartphone className="h-6 w-6" />
            </div>
            <h2 className="mt-5 text-xl font-semibold text-slate-950">
              Quy trình truy cập nhanh gọn
            </h2>
            <div className="mt-5 grid gap-3">
              {[
                {
                  icon: CheckCircle2,
                  title: 'Đăng ký đúng số điện thoại',
                  body: 'Số điện thoại sẽ được chuẩn hóa và dùng làm định danh chính cho khách hàng.',
                },
                {
                  icon: ShieldCheck,
                  title: 'Xác thực bằng OTP Zalo',
                  body: 'Mỗi mã chỉ dùng một lần, hết hạn sau 5 phút và được lưu hash ở backend.',
                },
                {
                  icon: CheckCircle2,
                  title: 'Vào portal ngay sau khi xác thực',
                  body: 'Sản lượng điện, hóa đơn và hỗ trợ vận hành sẽ sẵn sàng ngay khi kích hoạt.',
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="rounded-[20px] border border-slate-200 bg-white px-4 py-4"
                >
                  <div className="flex items-start gap-3">
                    <item.icon className="mt-1 h-5 w-5 shrink-0 text-slate-900" />
                    <div>
                      <p className="font-semibold text-slate-950">{item.title}</p>
                      <p className="mt-1 text-sm leading-6 text-slate-600">{item.body}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
