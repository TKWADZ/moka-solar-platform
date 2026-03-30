'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  CircleDollarSign,
  LifeBuoy,
  LockKeyhole,
  Sparkles,
  SunMedium,
  UserRound,
} from 'lucide-react';
import { LanguageSwitcher } from '@/components/language-switcher';
import { loginRequest } from '@/lib/api';
import { getDefaultRouteForRole, getSession, saveSession } from '@/lib/auth';
import { UserRole } from '@/types';

const SAMPLE_ACCOUNTS_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_SAMPLE_ACCOUNTS === 'true';
const SELF_REGISTER_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_SELF_REGISTER === 'true';

const sampleAccounts = [
  {
    role: 'SUPER_ADMIN' as UserRole,
    label: 'Quản trị hệ thống',
    description:
      'Theo dõi báo cáo điều hành, người dùng, cấu hình hệ thống và các tích hợp.',
    email: process.env.NEXT_PUBLIC_SAMPLE_SUPERADMIN_EMAIL || '',
    password: process.env.NEXT_PUBLIC_SAMPLE_SUPERADMIN_PASSWORD || '',
  },
  {
    role: 'ADMIN' as UserRole,
    label: 'Nhân sự vận hành',
    description:
      'Quản lý khách hàng, hóa đơn, ticket hỗ trợ và dữ liệu điện năng hằng ngày.',
    email: process.env.NEXT_PUBLIC_SAMPLE_ADMIN_EMAIL || '',
    password: process.env.NEXT_PUBLIC_SAMPLE_ADMIN_PASSWORD || '',
  },
  {
    role: 'CUSTOMER' as UserRole,
    label: 'Khách hàng',
    description:
      'Xem sản lượng điện, hóa đơn, thanh toán và tình trạng hệ thống của mình.',
    email: process.env.NEXT_PUBLIC_SAMPLE_CUSTOMER_EMAIL || '',
    password: process.env.NEXT_PUBLIC_SAMPLE_CUSTOMER_PASSWORD || '',
  },
].filter(
  (account): account is {
    role: UserRole;
    label: string;
    description: string;
    email: string;
    password: string;
  } => Boolean(account.email && account.password),
);

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hint, setHint] = useState('');

  useEffect(() => {
    const session = getSession();

    if (session) {
      window.location.replace(getDefaultRouteForRole(session.user.role));
    }
  }, []);

  const selectedSample = useMemo(
    () => sampleAccounts.find((account) => account.email === email),
    [email],
  );

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!email.trim() || !password.trim()) {
      setError('Vui lòng nhập email và mật khẩu để tiếp tục.');
      return;
    }

    setLoading(true);
    setError('');
    setHint('');

    try {
      const result = await loginRequest(email.trim(), password);
      saveSession(result);
      window.location.href = getDefaultRouteForRole(result.user.role);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Không thể đăng nhập. Vui lòng kiểm tra lại thông tin tài khoản.',
      );
    } finally {
      setLoading(false);
    }
  }

  function applySample(role: UserRole) {
    if (!SAMPLE_ACCOUNTS_ENABLED) {
      return;
    }

    const sample = sampleAccounts.find((account) => account.role === role);

    if (!sample) {
      return;
    }

    setEmail(sample.email);
    setPassword(sample.password);
    setError('');
    setHint(`Đã tự điền biểu mẫu cho vai trò ${sample.label.toLowerCase()}.`);
  }

  return (
    <main className="shell min-h-screen py-6 sm:py-10 lg:flex lg:items-center">
      <div className="grid w-full gap-5 lg:grid-cols-[1.04fr_0.96fr] lg:gap-6">
        <div className="surface-card-strong order-2 p-5 sm:p-8 lg:order-1 lg:p-10">
          <div className="flex items-center justify-between gap-4">
            <p className="eyebrow text-slate-500">Truy cập bảo mật</p>
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

          <div className="mt-4 rounded-[24px] border border-slate-200 bg-slate-50 p-4 lg:hidden">
            <p className="eyebrow text-slate-500">Cổng khách hàng Moka Solar</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950">
              Theo dõi điện mặt trời, hóa đơn và hỗ trợ vận hành trong cùng một nơi.
            </h2>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {[
                'Xem sản lượng điện và kỳ dữ liệu mới nhất',
                'Theo dõi hóa đơn, thanh toán và hạn đến hạn',
                'Gửi yêu cầu hỗ trợ khi hệ thống cần kiểm tra',
              ].map((item) => (
                <div
                  key={item}
                  className="rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>

          <h1 className="mt-5 text-3xl font-semibold text-slate-950 sm:text-[2.2rem]">
            Đăng nhập vào Moka Solar
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Dành cho khách hàng đã kích hoạt tài khoản, nhân sự vận hành và quản trị viên nội bộ.
          </p>

          {SAMPLE_ACCOUNTS_ENABLED && sampleAccounts.length ? (
            <div className="mt-6 grid gap-3 lg:hidden">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                Tài khoản mẫu
              </p>
              {sampleAccounts.map((account) => (
                <button
                  key={account.role}
                  type="button"
                  onClick={() => applySample(account.role)}
                  className="rounded-[20px] border border-slate-200 bg-white px-4 py-4 text-left transition hover:border-slate-300 hover:shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-950">{account.label}</p>
                      <p className="mt-1 text-sm leading-6 text-slate-600">{account.description}</p>
                    </div>
                    <Sparkles className="mt-1 h-4 w-4 shrink-0 text-slate-400" />
                  </div>
                </button>
              ))}
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="mt-7 space-y-4">
            <label className="grid gap-2 text-sm text-slate-700">
              <span>Email</span>
              <input
                className="field"
                placeholder="name@company.vn"
                value={email}
                autoComplete="email"
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>

            <label className="grid gap-2 text-sm text-slate-700">
              <span>Mật khẩu</span>
              <input
                className="field"
                placeholder="Nhập mật khẩu"
                type="password"
                value={password}
                autoComplete="current-password"
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>

            {selectedSample ? (
              <div className="rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                <div className="flex items-center gap-2">
                  <UserRound className="h-4 w-4" />
                  <span className="font-semibold">{selectedSample.label}</span>
                </div>
                <p className="mt-1 leading-6 text-emerald-800">{selectedSample.description}</p>
              </div>
            ) : null}

            {hint ? <p className="text-sm text-slate-500">{hint}</p> : null}
            {error ? <p className="text-sm text-rose-600">{error}</p> : null}

            <button
              disabled={loading}
              className="btn-dark flex w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                'Đang đăng nhập...'
              ) : (
                <>
                  <LockKeyhole className="h-4 w-4" />
                  Tiếp tục
                </>
              )}
            </button>
          </form>

          <div className="mt-6 rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-600">
            {SELF_REGISTER_ENABLED ? (
              <>
                Cần tạo tài khoản khách hàng mới?{' '}
                <Link
                  href="/register"
                  className="font-semibold text-slate-950 underline underline-offset-4"
                >
                  Gửi yêu cầu đăng ký
                </Link>
              </>
            ) : (
              <>
                Chưa có quyền truy cập?{' '}
                <Link
                  href="/contact"
                  className="font-semibold text-slate-950 underline underline-offset-4"
                >
                  Liên hệ Moka Solar để được cấp tài khoản
                </Link>
              </>
            )}
          </div>
        </div>

        <div className="hero-panel order-1 hidden overflow-hidden px-8 py-8 lg:order-2 lg:block">
          <div className="flex items-center justify-between gap-4">
            <p className="eyebrow text-slate-400">Cổng khách hàng Moka Solar</p>
            <LanguageSwitcher dark />
          </div>

          <div className="mt-7 max-w-xl">
            <h1 className="text-5xl font-semibold leading-[0.96] text-white">
              Theo dõi sản lượng điện, hóa đơn và hỗ trợ vận hành trong một cổng khách hàng thống nhất.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-8 text-slate-300">
              Sau khi đăng nhập, khách hàng có thể xem kỳ dữ liệu mới nhất, hóa đơn cần thanh toán,
              lịch sử thanh toán và gửi yêu cầu hỗ trợ khi hệ thống cần kiểm tra.
            </p>
          </div>

          <div className="mt-10 grid gap-5">
            <div className="rounded-[30px] border border-white/10 bg-white/[0.06] p-5 backdrop-blur-md">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
                    Bảng điều khiển khách hàng
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-white">
                    Mọi thông tin vận hành cần theo dõi đều ở trong một màn hình gọn gàng.
                  </p>
                </div>
                <ArrowUpRight className="h-6 w-6 shrink-0 text-amber-200" />
              </div>

              <div className="mt-6 grid gap-4 xl:grid-cols-[1.04fr_0.96fr]">
                <div className="rounded-[24px] border border-white/10 bg-[#07101d] p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[20px] border border-white/8 bg-white/[0.04] p-4">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                        Điện mặt trời tạo ra
                      </p>
                      <p className="mt-3 text-3xl font-semibold text-white">2.249,1 kWh</p>
                      <p className="mt-2 text-sm text-slate-400">Kỳ dữ liệu gần nhất đã đối soát.</p>
                    </div>
                    <div className="rounded-[20px] border border-white/8 bg-white/[0.04] p-4">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                        Cần thanh toán
                      </p>
                      <p className="mt-3 text-3xl font-semibold text-white">12.277.440 đ</p>
                      <p className="mt-2 text-sm text-slate-400">Tổng các hóa đơn đang mở.</p>
                    </div>
                  </div>

                  <div className="mt-4 rounded-[22px] border border-white/8 bg-white/[0.04] p-4">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                      Kỳ đang theo dõi
                    </p>
                    <div className="mt-3 flex items-end justify-between gap-4">
                      <div>
                        <p className="text-2xl font-semibold text-white">03/2026</p>
                        <p className="mt-2 text-sm text-slate-400">
                          Dữ liệu được cập nhật định kỳ và giữ nguyên kỳ gần nhất nếu chưa có bản mới.
                        </p>
                      </div>
                      <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-100">
                        Đã cập nhật
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  {[
                    {
                      icon: SunMedium,
                      title: 'Sản lượng điện',
                      body: 'Xem sản lượng theo kỳ, tình trạng cập nhật và dữ liệu của từng hệ thống.',
                    },
                    {
                      icon: CircleDollarSign,
                      title: 'Hóa đơn và thanh toán',
                      body: 'Theo dõi hóa đơn cần thanh toán, lịch sử giao dịch và hạn đến hạn gần nhất.',
                    },
                    {
                      icon: LifeBuoy,
                      title: 'Hỗ trợ vận hành',
                      body: 'Gửi yêu cầu kiểm tra hệ thống, theo dõi ticket và nhận phản hồi từ đội ngũ Moka Solar.',
                    },
                  ].map((item) => {
                    const Icon = item.icon;

                    return (
                      <div
                        key={item.title}
                        className="rounded-[24px] border border-white/10 bg-black/20 px-5 py-4"
                      >
                        <div className="flex items-start gap-3">
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/[0.06] text-white">
                            <Icon className="h-5 w-5" />
                          </span>
                          <div>
                            <p className="text-base font-semibold text-white">{item.title}</p>
                            <p className="mt-2 text-sm leading-6 text-slate-400">{item.body}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-emerald-300/15 bg-emerald-400/12 p-5">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-200" />
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-emerald-100/70">
                    Truy cập theo tài khoản đã cấp
                  </p>
                  <p className="mt-3 text-2xl font-semibold text-white">
                    Nếu bạn chưa có tài khoản, đội ngũ Moka Solar sẽ kích hoạt theo hợp đồng và hệ thống đã bàn giao.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
