'use client';

import Link from 'next/link';
import { useState } from 'react';
import { LanguageSwitcher } from '@/components/language-switcher';
import { registerRequest } from '@/lib/api';
import { getDefaultRouteForRole, saveSession } from '@/lib/auth';

const SELF_REGISTER_ENABLED = process.env.NEXT_PUBLIC_ENABLE_SELF_REGISTER === 'true';

export default function RegisterPage() {
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    password: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!form.fullName.trim() || !form.email.trim() || !form.password.trim()) {
      setError('Vui lòng nhập đầy đủ họ tên, email và mật khẩu.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const session = await registerRequest(form);
      saveSession(session);
      window.location.href = getDefaultRouteForRole(session.user.role);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Không thể tạo tài khoản mới. Vui lòng thử lại.',
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
            Để bảo đảm đúng hợp đồng, đúng địa điểm lắp đặt và đúng quyền truy cập, Moka Solar
            hiện không mở tự đăng ký công khai. Đội ngũ vận hành sẽ tạo tài khoản cho khách hàng
            sau khi kích hoạt hồ sơ dự án hoặc hoàn tất bàn giao hệ thống.
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
      <div className="surface-card-strong w-full max-w-2xl p-8">
        <div className="flex items-center justify-between gap-4">
          <p className="eyebrow text-slate-500">Đăng ký tài khoản khách hàng</p>
          <LanguageSwitcher />
        </div>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">
          Khởi tạo quyền truy cập cho cổng khách hàng
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Sau khi đăng ký, hệ thống sẽ đưa bạn vào khu vực khách hàng để xem điện năng, hóa đơn và
          thanh toán.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 grid gap-4">
          <input
            className="field"
            placeholder="Họ và tên"
            value={form.fullName}
            onChange={(event) => setForm({ ...form, fullName: event.target.value })}
          />
          <input
            className="field"
            placeholder="Email"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
          />
          <input
            className="field"
            placeholder="Số điện thoại"
            value={form.phone}
            onChange={(event) => setForm({ ...form, phone: event.target.value })}
          />
          <input
            className="field"
            placeholder="Mật khẩu"
            type="password"
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
          />
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          <button className="btn-dark">{loading ? 'Đang tạo tài khoản...' : 'Tạo tài khoản'}</button>
        </form>
      </div>
    </main>
  );
}
