'use client';

import { useEffect, useMemo, useState } from 'react';
import { BellRing, LockKeyhole, MapPinned, WalletCards } from 'lucide-react';
import { SectionCard } from '@/components/section-card';
import {
  listMyNotificationsRequest,
  listMyPaymentsRequest,
  myCustomerProfileRequest,
} from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import { CustomerRecord, NotificationRecord, PaymentRecord } from '@/types';

function formatRelativeTime(value?: string | null) {
  if (!value) {
    return 'Vừa xong';
  }

  const target = new Date(value).getTime();
  const deltaMinutes = Math.max(0, Math.round((Date.now() - target) / 60000));

  if (deltaMinutes < 1) {
    return 'Vừa xong';
  }

  if (deltaMinutes < 60) {
    return `${deltaMinutes} phút trước`;
  }

  const deltaHours = Math.round(deltaMinutes / 60);
  if (deltaHours < 24) {
    return `${deltaHours} giờ trước`;
  }

  const deltaDays = Math.round(deltaHours / 24);
  if (deltaDays < 30) {
    return `${deltaDays} ngày trước`;
  }

  return formatDateTime(value);
}

function buildPaymentPreference(payments: PaymentRecord[]) {
  if (!payments.length) {
    return 'Chưa ghi nhận phương thức thanh toán mặc định. Đội vận hành sẽ xác nhận theo hóa đơn gần nhất của bạn.';
  }

  const latestPayment = [...payments].sort((left, right) => {
    const leftTime = new Date(left.paidAt || left.createdAt).getTime();
    const rightTime = new Date(right.paidAt || right.createdAt).getTime();
    return rightTime - leftTime;
  })[0];

  const parts = [latestPayment.method, latestPayment.gateway].filter(Boolean);
  return `Ưu tiên ${parts.join(' qua ')}. Lần thanh toán gần nhất vào ${formatDateTime(
    latestPayment.paidAt || latestPayment.createdAt,
  )}.`;
}

export default function CustomerProfilePage() {
  const [profile, setProfile] = useState<CustomerRecord | null>(null);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function loadProfilePage() {
      setLoading(true);
      setError('');

      const [profileResult, notificationsResult, paymentsResult] = await Promise.allSettled([
        myCustomerProfileRequest(),
        listMyNotificationsRequest(),
        listMyPaymentsRequest(),
      ]);

      if (!active) {
        return;
      }

      if (profileResult.status === 'fulfilled') {
        setProfile(profileResult.value);
      } else {
        setError(
          profileResult.reason instanceof Error
            ? profileResult.reason.message
            : 'Không thể tải hồ sơ khách hàng.',
        );
      }

      setNotifications(
        notificationsResult.status === 'fulfilled' ? notificationsResult.value.slice(0, 5) : [],
      );
      setPayments(paymentsResult.status === 'fulfilled' ? paymentsResult.value : []);
      setLoading(false);
    }

    loadProfilePage().catch((requestError) => {
      if (!active) {
        return;
      }

      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Không thể tải hồ sơ khách hàng.',
      );
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, []);

  const primarySystem = profile?.solarSystems?.[0] || null;

  const installationAddress = useMemo(() => {
    return (
      profile?.installationAddress ||
      primarySystem?.locationAddress ||
      primarySystem?.location ||
      'Chưa cập nhật'
    );
  }, [primarySystem?.location, primarySystem?.locationAddress, profile?.installationAddress]);

  const billingAddress = useMemo(() => {
    return profile?.billingAddress || installationAddress;
  }, [installationAddress, profile?.billingAddress]);

  const securityItems = useMemo(() => {
    if (!profile) {
      return [];
    }

    return [
      'Xác thực access token + refresh token',
      'Phân quyền theo vai trò',
      profile.ownerUser
        ? `Đầu mối phụ trách: ${profile.ownerUser.fullName}`
        : 'Đội vận hành Moka Solar đang theo dõi tài khoản này',
      `Trạng thái tài khoản: ${profile.status}`,
    ];
  }, [profile]);

  if (loading) {
    return (
      <SectionCard title="Thông tin tài khoản và địa điểm" eyebrow="Hồ sơ khách hàng" dark>
        <p className="text-sm text-slate-300">Đang tải hồ sơ khách hàng...</p>
      </SectionCard>
    );
  }

  if (!profile) {
    return (
      <SectionCard title="Thông tin tài khoản và địa điểm" eyebrow="Hồ sơ khách hàng" dark>
        <p className="text-sm text-rose-300">
          {error || 'Không tìm thấy dữ liệu hồ sơ cho tài khoản này.'}
        </p>
      </SectionCard>
    );
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
      <SectionCard title="Thông tin tài khoản và địa điểm" eyebrow="Hồ sơ khách hàng" dark>
        <div className="space-y-4">
          <div className="portal-card-soft p-5">
            <div className="flex items-start gap-3">
              <MapPinned className="mt-1 h-5 w-5 text-slate-300" />
              <div className="grid gap-3 text-sm text-slate-300">
                <p>
                  Chủ tài khoản:{' '}
                  <span className="font-medium text-white">{profile.user.fullName}</span>
                </p>
                <p>
                  Mã khách hàng:{' '}
                  <span className="font-medium text-white">{profile.customerCode}</span>
                </p>
                <p>
                  Doanh nghiệp:{' '}
                  <span className="font-medium text-white">
                    {profile.companyName || 'Khách hàng cá nhân'}
                  </span>
                </p>
                <p>
                  Email đăng nhập:{' '}
                  <span className="font-medium text-white">{profile.user.email}</span>
                </p>
                <p>
                  Số điện thoại:{' '}
                  <span className="font-medium text-white">
                    {profile.user.phone || 'Chưa cập nhật'}
                  </span>
                </p>
                <p>
                  Địa chỉ lắp đặt:{' '}
                  <span className="font-medium text-white">{installationAddress}</span>
                </p>
                <p>
                  Địa chỉ xuất hóa đơn:{' '}
                  <span className="font-medium text-white">{billingAddress}</span>
                </p>
                <p>
                  Hệ thống liên kết:{' '}
                  <span className="font-medium text-white">
                    {profile.solarSystems?.length || 0} hệ thống
                  </span>
                </p>
              </div>
            </div>
          </div>

          <div className="portal-card-soft p-5">
            <div className="flex items-start gap-3">
              <WalletCards className="mt-1 h-5 w-5 text-slate-300" />
              <div>
                <p className="text-sm font-semibold text-white">Phương thức thanh toán ưu tiên</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  {buildPaymentPreference(payments)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Bảo mật và thông báo" eyebrow="Cài đặt tài khoản" dark>
        <div className="space-y-4">
          <div className="portal-card-soft p-5">
            <div className="flex items-start gap-3">
              <LockKeyhole className="mt-1 h-5 w-5 text-slate-300" />
              <div className="space-y-3">
                <p className="text-sm font-semibold text-white">Lớp bảo mật hiện tại</p>
                {securityItems.map((item) => (
                  <div
                    key={item}
                    className="rounded-[18px] border border-white/8 bg-white/5 px-4 py-3 text-sm text-slate-300"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="portal-card-soft p-5">
            <div className="flex items-start gap-3">
              <BellRing className="mt-1 h-5 w-5 text-slate-300" />
              <div className="w-full">
                <p className="text-sm font-semibold text-white">Thông báo gần đây</p>
                <div className="mt-4 space-y-3">
                  {notifications.length ? (
                    notifications.map((note) => (
                      <div
                        key={note.id}
                        className="rounded-[18px] border border-white/8 bg-white/5 px-4 py-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-white">{note.title}</p>
                          <span className="text-xs text-slate-500">
                            {formatRelativeTime(note.createdAt)}
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-slate-300">{note.body}</p>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-[18px] border border-white/8 bg-white/5 px-4 py-4 text-sm leading-6 text-slate-300">
                      Chưa có thông báo mới. Hệ thống sẽ hiển thị cập nhật về hóa đơn, hỗ trợ và
                      đồng bộ sản lượng tại đây.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {error ? (
            <div className="rounded-[20px] border border-amber-300/15 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
              {error}
            </div>
          ) : null}
        </div>
      </SectionCard>
    </div>
  );
}
