'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  KeyRound,
  ShieldCheck,
  Smartphone,
  SunMedium,
} from 'lucide-react';
import { LanguageSwitcher } from '@/components/language-switcher';
import { loginRequest } from '@/lib/api';
import { getDefaultRouteForRole, getSession, saveSession } from '@/lib/auth';
import { UserRole } from '@/types';

const SAMPLE_ACCOUNTS_ENABLED = process.env.NEXT_PUBLIC_ENABLE_SAMPLE_ACCOUNTS === 'true';
const SELF_REGISTER_ENABLED = process.env.NEXT_PUBLIC_ENABLE_SELF_REGISTER !== 'false';

const sampleAccounts = [
  {
    role: 'SUPER_ADMIN' as UserRole,
    label: 'Super Admin',
    description: 'Toàn quyền cấu hình, bảo mật và tích hợp.',
    email: process.env.NEXT_PUBLIC_SAMPLE_SUPERADMIN_EMAIL || '',
    password: process.env.NEXT_PUBLIC_SAMPLE_SUPERADMIN_PASSWORD || '',
  },
  {
    role: 'ADMIN' as UserRole,
    label: 'Admin',
    description: 'Điều phối vận hành, billing và phân quyền.',
    email: process.env.NEXT_PUBLIC_SAMPLE_ADMIN_EMAIL || '',
    password: process.env.NEXT_PUBLIC_SAMPLE_ADMIN_PASSWORD || '',
  },
  {
    role: 'MANAGER' as UserRole,
    label: 'Manager',
    description: 'Quản lý ticket, hợp đồng và vận hành khách hàng.',
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

export default function LoginPage() {
  const [mode, setMode] = useState<'CUSTOMER' | 'INTERNAL'>('CUSTOMER');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerPassword, setCustomerPassword] = useState('');
  const [internalEmail, setInternalEmail] = useState('');
  const [internalPassword, setInternalPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hint, setHint] = useState('');

  useEffect(() => {
    const session = getSession();
    if (session) {
      window.location.replace(getDefaultRouteForRole(session.user.role));
    }
  }, []);

  const normalizedCustomerPhone = useMemo(
    () => normalizeVietnamPhoneCandidate(customerPhone),
    [customerPhone],
  );

  async function handleCustomerLogin(event: React.FormEvent) {
    event.preventDefault();

    if (!normalizedCustomerPhone) {
      setError('Vui lòng nhập số điện thoại Việt Nam hợp lệ.');
      return;
    }

    if (!customerPassword.trim()) {
      setError('Vui lòng nhập mật khẩu để tiếp tục.');
      return;
    }

    setLoading(true);
    setError('');
    setHint('');

    try {
      const session = await loginRequest(normalizedCustomerPhone, customerPassword);
      saveSession(session);
      window.location.href = getDefaultRouteForRole(session.user.role);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Không thể đăng nhập bằng số điện thoại. Vui lòng thử lại.',
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleInternalLogin(event: React.FormEvent) {
    event.preventDefault();

    if (!internalEmail.trim() || !internalPassword.trim()) {
      setError('Vui lòng nhập email và mật khẩu để tiếp tục.');
      return;
    }

    setLoading(true);
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
      setLoading(false);
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
                mode === 'CUSTOMER' ? 'bg-slate-950 text-white' : 'text-slate-600 hover:text-slate-950'
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
                mode === 'INTERNAL' ? 'bg-slate-950 text-white' : 'text-slate-600 hover:text-slate-950'
              }`}
            >
              Nhân sự
            </button>
          </div>

          {mode === 'CUSTOMER' ? (
            <form onSubmit={handleCustomerLogin} className="mt-6 grid gap-4">
              <div>
                <h1 className="text-3xl font-semibold text-slate-950 sm:text-[2.2rem]">
                  Đăng nhập khách hàng bằng số điện thoại
                </h1>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Dùng số điện thoại đã đăng ký với Moka Solar và mật khẩu cá nhân để xem sản lượng,
                  hóa đơn, thanh toán và hỗ trợ vận hành.
                </p>
              </div>

              <input
                className="field"
                placeholder="Số điện thoại"
                value={customerPhone}
                onChange={(event) => setCustomerPhone(event.target.value)}
                inputMode="tel"
                autoComplete="tel"
              />
              <input
                className="field"
                placeholder="Mật khẩu"
                value={customerPassword}
                onChange={(event) => setCustomerPassword(event.target.value)}
                type="password"
                autoComplete="current-password"
              />

              {error ? <p className="text-sm text-rose-600">{error}</p> : null}
              {hint ? <p className="text-sm text-emerald-700">{hint}</p> : null}

              <div className="flex flex-wrap gap-3">
                <button className="btn-dark" disabled={loading}>
                  {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
                </button>
                {SELF_REGISTER_ENABLED ? (
                  <Link
                    href="/register"
                    className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-900 hover:text-slate-950"
                  >
                    Tạo tài khoản mới
                  </Link>
                ) : null}
                <Link
                  href="/forgot-password"
                  className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-900 hover:text-slate-950"
                >
                  Quên mật khẩu
                </Link>
              </div>
            </form>
          ) : (
            <form onSubmit={handleInternalLogin} className="mt-6 grid gap-4">
              <div>
                <h1 className="text-3xl font-semibold text-slate-950 sm:text-[2.2rem]">
                  Đăng nhập nhân sự bằng email
                </h1>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Dành cho admin, manager và staff. Luồng email + mật khẩu được giữ riêng để sẵn
                  sàng bật TOTP 2FA cho vận hành nội bộ.
                </p>
              </div>

              <input
                className="field"
                placeholder="Email công việc"
                value={internalEmail}
                onChange={(event) => setInternalEmail(event.target.value)}
                autoComplete="email"
              />
              <input
                className="field"
                placeholder="Mật khẩu"
                value={internalPassword}
                onChange={(event) => setInternalPassword(event.target.value)}
                type="password"
                autoComplete="current-password"
              />

              {error ? <p className="text-sm text-rose-600">{error}</p> : null}
              {hint ? <p className="text-sm text-emerald-700">{hint}</p> : null}

              <div className="flex flex-wrap gap-3">
                <button className="btn-dark" disabled={loading}>
                  {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
                </button>
              </div>

              {SAMPLE_ACCOUNTS_ENABLED && sampleAccounts.length ? (
                <div className="mt-3 grid gap-3 rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                    Tài khoản mẫu local
                  </p>
                  {sampleAccounts.map((account) => (
                    <button
                      key={account.role}
                      type="button"
                      onClick={() => applySample(account.role)}
                      className="rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-slate-950"
                    >
                      <div className="text-sm font-semibold text-slate-900">{account.label}</div>
                      <div className="mt-1 text-sm leading-6 text-slate-600">{account.description}</div>
                    </button>
                  ))}
                </div>
              ) : null}
            </form>
          )}
        </div>

        <aside className="surface-card-strong order-1 overflow-hidden p-5 sm:p-8 lg:order-2 lg:p-10">
          <div className="eyebrow text-slate-500">Moka Solar customer portal</div>
          <h2 className="mt-3 text-3xl font-semibold text-slate-950">
            Theo dõi điện mặt trời, hóa đơn và hỗ trợ trên một cổng riêng
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-7 text-slate-600">
            Khách hàng xem dữ liệu vận hành hằng tháng bằng số điện thoại và mật khẩu. Khi cần xác
            minh quan trọng như đăng ký mới hay khôi phục mật khẩu, hệ thống sẽ gửi OTP qua Zalo.
          </p>

          <div className="mt-8 grid gap-3">
            {[
              {
                icon: SunMedium,
                title: 'Sản lượng và hệ thống',
                body: 'Theo dõi sản lượng PV, trạng thái inverter và dữ liệu tháng gần nhất.',
              },
              {
                icon: Smartphone,
                title: 'Số điện thoại là định danh chính',
                body: 'Số điện thoại được chuẩn hóa khi lưu và khi đăng nhập để giảm nhầm lẫn.',
              },
              {
                icon: ShieldCheck,
                title: 'OTP chỉ dùng khi cần xác minh',
                body: 'Đăng ký, quên mật khẩu, xác minh số điện thoại hoặc thao tác nhạy cảm.',
              },
              {
                icon: KeyRound,
                title: 'Nhân sự nội bộ tách riêng',
                body: 'Admin, manager và staff tiếp tục dùng email + mật khẩu, sẵn sàng cho TOTP 2FA.',
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-[24px] border border-slate-200 bg-slate-50 px-5 py-4"
              >
                <div className="flex items-center gap-3 text-slate-950">
                  <item.icon className="h-5 w-5" />
                  <div className="font-semibold">{item.title}</div>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">{item.body}</p>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </main>
  );
}
