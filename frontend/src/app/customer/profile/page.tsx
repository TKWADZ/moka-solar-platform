'use client';

import type { ChangeEvent, ComponentType } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BellRing,
  Camera,
  Loader2,
  LockKeyhole,
  Mail,
  MapPinned,
  PencilLine,
  Phone,
  Save,
  ShieldCheck,
  UserRound,
  WalletCards,
  XCircle,
} from 'lucide-react';
import { CustomerThemeSwitch, useCustomerTheme } from '@/components/customer-theme-provider';
import {
  CustomerToastViewport,
  useCustomerToast,
} from '@/components/customer-toast';
import { SectionCard } from '@/components/section-card';
import {
  changeMyCustomerPasswordRequest,
  listMyNotificationsRequest,
  listMyPaymentsRequest,
  myCustomerProfileRequest,
  updateMyCustomerProfileRequest,
  uploadMyCustomerAvatarRequest,
} from '@/lib/api';
import { cn, formatCurrency, formatDateTime } from '@/lib/utils';
import { CustomerRecord, NotificationRecord, PaymentRecord } from '@/types';

type ProfileFormState = {
  fullName: string;
  email: string;
  phone: string;
  contactAddress: string;
};

type PasswordFormState = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

const EMPTY_PROFILE_FORM: ProfileFormState = {
  fullName: '',
  email: '',
  phone: '',
  contactAddress: '',
};

const EMPTY_PASSWORD_FORM: PasswordFormState = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
};

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

function buildInitials(value?: string | null) {
  const source = (value || 'Moka Solar').trim();
  const parts = source.split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() || '').join('') || 'MS';
}

function buildProfileForm(profile: CustomerRecord | null): ProfileFormState {
  if (!profile) {
    return EMPTY_PROFILE_FORM;
  }

  return {
    fullName: profile.user.fullName || '',
    email: profile.user.email || '',
    phone: profile.user.phone || '',
    contactAddress: profile.billingAddress || profile.installationAddress || '',
  };
}

function validateProfileForm(form: ProfileFormState) {
  if (form.fullName.trim().length < 2) {
    return 'Họ tên cần có ít nhất 2 ký tự.';
  }

  const email = form.email.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return 'Email chưa đúng định dạng.';
  }

  const phoneDigits = form.phone.replace(/\D/g, '');
  if (form.phone.trim() && phoneDigits.length < 9) {
    return 'Số điện thoại cần có ít nhất 9 chữ số.';
  }

  if (form.contactAddress.trim().length > 240) {
    return 'Địa chỉ liên hệ đang vượt quá 240 ký tự.';
  }

  return '';
}

function validatePasswordForm(form: PasswordFormState) {
  if (!form.currentPassword) {
    return 'Vui lòng nhập mật khẩu hiện tại.';
  }

  if (form.newPassword.length < 6) {
    return 'Mật khẩu mới cần có ít nhất 6 ký tự.';
  }

  if (form.newPassword !== form.confirmPassword) {
    return 'Mật khẩu xác nhận chưa khớp.';
  }

  if (form.currentPassword === form.newPassword) {
    return 'Mật khẩu mới cần khác mật khẩu hiện tại.';
  }

  return '';
}

function ProfileField({
  label,
  icon: Icon,
  value,
  onChange,
  placeholder,
  disabled,
  type = 'text',
  multiline = false,
}: {
  label: string;
  icon: ComponentType<{ className?: string }>;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  type?: 'text' | 'email' | 'tel' | 'password';
  multiline?: boolean;
}) {
  return (
    <label className="grid gap-2">
      <span className="flex items-center gap-2 text-sm font-medium text-slate-500">
        <Icon className="h-4 w-4" />
        {label}
      </span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          rows={4}
          className="customer-field min-h-[120px] resize-y disabled:cursor-not-allowed disabled:opacity-70"
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className="customer-field disabled:cursor-not-allowed disabled:opacity-70"
        />
      )}
    </label>
  );
}

function ReadonlyMetric({
  label,
  value,
  dark = false,
}: {
  label: string;
  value: string;
  dark?: boolean;
}) {
  return (
    <div className="customer-soft-card-muted px-4 py-4">
      <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
        {label}
      </p>
      <p className={cn('mt-2 text-sm font-semibold leading-6', dark ? 'text-white' : 'text-slate-900')}>
        {value}
      </p>
    </div>
  );
}

export default function CustomerProfilePage() {
  const { theme } = useCustomerTheme();
  const isDark = theme === 'dark';
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const { toast, dismissToast, showToast } = useCustomerToast();

  const [profile, setProfile] = useState<CustomerRecord | null>(null);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingProfile, setEditingProfile] = useState(false);
  const [editingPassword, setEditingPassword] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [profileForm, setProfileForm] = useState<ProfileFormState>(EMPTY_PROFILE_FORM);
  const [passwordForm, setPasswordForm] = useState<PasswordFormState>(EMPTY_PASSWORD_FORM);

  const loadProfilePage = useCallback(async () => {
    setLoading(true);
    setError('');

    const [profileResult, notificationsResult, paymentsResult] = await Promise.allSettled([
      myCustomerProfileRequest(),
      listMyNotificationsRequest(),
      listMyPaymentsRequest(),
    ]);

    if (profileResult.status === 'fulfilled') {
      setProfile(profileResult.value);
      setProfileForm(buildProfileForm(profileResult.value));
    } else {
      setError(
        profileResult.reason instanceof Error
          ? profileResult.reason.message
          : 'Không thể tải hồ sơ khách hàng.',
      );
      setProfile(null);
    }

    setNotifications(
      notificationsResult.status === 'fulfilled' ? notificationsResult.value.slice(0, 5) : [],
    );
    setPayments(paymentsResult.status === 'fulfilled' ? paymentsResult.value : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadProfilePage().catch((requestError) => {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Không thể tải hồ sơ khách hàng.',
      );
      setLoading(false);
    });
  }, [loadProfilePage]);

  const primarySystem = profile?.solarSystems?.[0] || null;
  const primaryContract = profile?.contracts?.[0] || null;

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

  const totalCapacity = useMemo(() => {
    return (profile?.solarSystems || []).reduce((sum, system) => sum + (system.capacityKwp || 0), 0);
  }, [profile?.solarSystems]);

  const systemCountLabel = useMemo(() => {
    const count = profile?.solarSystems?.length || 0;
    return `${count} hệ thống`;
  }, [profile?.solarSystems]);

  const systemInfoItems = useMemo(() => {
    return [
      {
        label: 'Mã khách hàng',
        value: profile?.customerCode || '-',
      },
      {
        label: 'Mã hợp đồng',
        value: primaryContract?.contractNumber || 'Chưa cập nhật',
      },
      {
        label: 'Công suất hệ thống',
        value: totalCapacity > 0 ? `${totalCapacity.toLocaleString('vi-VN')} kWp` : 'Chưa cập nhật',
      },
      {
        label: 'Billing config',
        value:
          profile?.defaultUnitPrice != null
            ? `${formatCurrency(profile.defaultUnitPrice)}/kWh`
            : 'Đội vận hành đang quản lý',
      },
      {
        label: 'Trạng thái hợp đồng',
        value: primaryContract?.status || profile?.status || 'Chưa cập nhật',
      },
      {
        label: 'Hệ thống liên kết',
        value: systemCountLabel,
      },
    ];
  }, [primaryContract?.contractNumber, primaryContract?.status, profile, systemCountLabel, totalCapacity]);

  const securityItems = useMemo(() => {
    if (!profile) {
      return [];
    }

    return [
      'Đăng nhập khách hàng bằng số điện thoại + mật khẩu.',
      'OTP chỉ dùng khi đăng ký, quên mật khẩu hoặc xác minh thao tác nhạy cảm.',
      profile.ownerUser
        ? `Đầu mối phụ trách: ${profile.ownerUser.fullName}`
        : 'Đội vận hành Moka Solar đang theo dõi tài khoản này.',
      `Trạng thái tài khoản: ${profile.status}`,
    ];
  }, [profile]);

  async function handleSaveProfile() {
    const validationError = validateProfileForm(profileForm);
    if (validationError) {
      showToast(validationError, 'error');
      return;
    }

    setSavingProfile(true);

    try {
      const updated = await updateMyCustomerProfileRequest({
        fullName: profileForm.fullName.trim(),
        email: profileForm.email.trim(),
        phone: profileForm.phone.trim(),
        contactAddress: profileForm.contactAddress.trim(),
      });

      setProfile(updated);
      setProfileForm(buildProfileForm(updated));
      setEditingProfile(false);
      showToast('Hồ sơ đã được cập nhật.', 'success');
    } catch (requestError) {
      showToast(
        requestError instanceof Error
          ? requestError.message
          : 'Không thể lưu hồ sơ lúc này.',
        'error',
      );
    } finally {
      setSavingProfile(false);
    }
  }

  function handleCancelProfileEdit() {
    setProfileForm(buildProfileForm(profile));
    setEditingProfile(false);
  }

  async function handleSavePassword() {
    const validationError = validatePasswordForm(passwordForm);
    if (validationError) {
      showToast(validationError, 'error');
      return;
    }

    setSavingPassword(true);

    try {
      await changeMyCustomerPasswordRequest({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });

      setPasswordForm(EMPTY_PASSWORD_FORM);
      setEditingPassword(false);
      showToast('Mật khẩu đã được cập nhật.', 'success');
    } catch (requestError) {
      showToast(
        requestError instanceof Error
          ? requestError.message
          : 'Không thể đổi mật khẩu lúc này.',
        'error',
      );
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const formData = new FormData();
    formData.append('avatar', file);
    setUploadingAvatar(true);

    try {
      const updated = await uploadMyCustomerAvatarRequest(formData);
      setProfile(updated);
      setProfileForm(buildProfileForm(updated));
      showToast('Ảnh đại diện đã được cập nhật.', 'success');
    } catch (requestError) {
      showToast(
        requestError instanceof Error
          ? requestError.message
          : 'Không thể tải ảnh đại diện lên.',
        'error',
      );
    } finally {
      setUploadingAvatar(false);
      if (avatarInputRef.current) {
        avatarInputRef.current.value = '';
      }
    }
  }

  if (loading) {
    return (
      <SectionCard title="Thông tin tài khoản và địa điểm" eyebrow="Hồ sơ khách hàng">
        <p className={cn('text-sm', isDark ? 'text-slate-300' : 'text-slate-600')}>
          Đang tải hồ sơ khách hàng...
        </p>
      </SectionCard>
    );
  }

  if (!profile) {
    return (
      <SectionCard title="Thông tin tài khoản và địa điểm" eyebrow="Hồ sơ khách hàng">
        <p className={cn('text-sm', isDark ? 'text-rose-300' : 'text-rose-600')}>
          {error || 'Không tìm thấy dữ liệu hồ sơ cho tài khoản này.'}
        </p>
      </SectionCard>
    );
  }

  return (
    <>
      <CustomerToastViewport toast={toast} onClose={dismissToast} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.04fr)_minmax(0,0.96fr)]">
        <div className="space-y-5">
          <SectionCard title="Hồ sơ cá nhân" eyebrow="Tài khoản khách hàng">
            <div className="grid gap-5">
              <div className="customer-soft-card px-4 py-4 sm:px-5 sm:py-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-center gap-4">
                    <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-[28px] border border-white/10 bg-slate-950/8">
                      {profile.user.avatarUrl ? (
                        <img
                          src={profile.user.avatarUrl}
                          alt={profile.user.fullName}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-950 to-teal-700 text-xl font-semibold text-white">
                          {buildInitials(profile.user.fullName)}
                        </div>
                      )}
                    </div>

                    <div className="min-w-0">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
                        Chủ tài khoản
                      </p>
                      <h2 className={cn('mt-2 text-xl font-semibold tracking-tight', isDark ? 'text-white' : 'text-slate-950')}>
                        {profile.user.fullName}
                      </h2>
                      <p className={cn('mt-2 text-sm leading-6', isDark ? 'text-slate-300' : 'text-slate-600')}>
                        {profile.companyName || 'Khách hàng cá nhân'} · {systemCountLabel}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleAvatarChange}
                    />
                    <button
                      type="button"
                      onClick={() => avatarInputRef.current?.click()}
                      disabled={uploadingAvatar}
                      className="btn-secondary-light"
                    >
                      {uploadingAvatar ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Camera className="h-4 w-4" />
                      )}
                      {uploadingAvatar ? 'Đang tải ảnh...' : 'Đổi ảnh đại diện'}
                    </button>

                    {!editingProfile ? (
                      <button
                        type="button"
                        onClick={() => setEditingProfile(true)}
                        className="btn-primary"
                      >
                        <PencilLine className="h-4 w-4" />
                        Chỉnh sửa
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={handleCancelProfileEdit}
                          disabled={savingProfile}
                          className="btn-secondary-light"
                        >
                          <XCircle className="h-4 w-4" />
                          Hủy
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveProfile}
                          disabled={savingProfile}
                          className="btn-primary"
                        >
                          {savingProfile ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Save className="h-4 w-4" />
                          )}
                          {savingProfile ? 'Đang lưu...' : 'Lưu thay đổi'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <ProfileField
                  label="Họ tên"
                  icon={UserRound}
                  value={profileForm.fullName}
                  onChange={(value) => setProfileForm((current) => ({ ...current, fullName: value }))}
                  placeholder="Nhập họ tên"
                  disabled={!editingProfile || savingProfile}
                />
                <ProfileField
                  label="Số điện thoại"
                  icon={Phone}
                  type="tel"
                  value={profileForm.phone}
                  onChange={(value) => setProfileForm((current) => ({ ...current, phone: value }))}
                  placeholder="Nhập số điện thoại"
                  disabled={!editingProfile || savingProfile}
                />
                <ProfileField
                  label="Email"
                  icon={Mail}
                  type="email"
                  value={profileForm.email}
                  onChange={(value) => setProfileForm((current) => ({ ...current, email: value }))}
                  placeholder="you@example.com"
                  disabled={!editingProfile || savingProfile}
                />
                <ProfileField
                  label="Địa chỉ liên hệ"
                  icon={MapPinned}
                  value={profileForm.contactAddress}
                  onChange={(value) => setProfileForm((current) => ({ ...current, contactAddress: value }))}
                  placeholder="Nhập địa chỉ liên hệ"
                  disabled={!editingProfile || savingProfile}
                  multiline
                />
              </div>

              <div className="customer-page-note">
                Bạn có thể tự chỉnh sửa hồ sơ cá nhân, số điện thoại, email, địa chỉ liên hệ,
                ảnh đại diện và mật khẩu. Các thông tin hệ thống như mã khách hàng, hợp đồng,
                công suất, billing config và trạng thái hợp đồng vẫn được khóa để tránh sai lệch
                vận hành.
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Thông tin hệ thống bị khóa" eyebrow="Chỉ xem">
            <div className="grid gap-4 sm:grid-cols-2">
              {systemInfoItems.map((item) => (
                <ReadonlyMetric key={item.label} label={item.label} value={item.value} dark={isDark} />
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Bảo mật tài khoản" eyebrow="Mật khẩu và xác minh">
            <div className="grid gap-4">
              <div className="customer-soft-card px-4 py-4 sm:px-5 sm:py-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
                      Mật khẩu
                    </p>
                    <h3 className={cn('mt-2 text-lg font-semibold tracking-tight', isDark ? 'text-white' : 'text-slate-950')}>
                      Đổi mật khẩu portal khách hàng
                    </h3>
                    <p className={cn('mt-2 text-sm leading-6', isDark ? 'text-slate-300' : 'text-slate-600')}>
                      Admin, manager và staff vẫn dùng luồng đăng nhập riêng. Khu vực này chỉ cập nhật
                      mật khẩu của tài khoản khách hàng.
                    </p>
                  </div>

                  {!editingPassword ? (
                    <button
                      type="button"
                      onClick={() => setEditingPassword(true)}
                      className="btn-secondary-light"
                    >
                      <LockKeyhole className="h-4 w-4" />
                      Đổi mật khẩu
                    </button>
                  ) : (
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingPassword(false);
                          setPasswordForm(EMPTY_PASSWORD_FORM);
                        }}
                        disabled={savingPassword}
                        className="btn-secondary-light"
                      >
                        <XCircle className="h-4 w-4" />
                        Hủy
                      </button>
                      <button
                        type="button"
                        onClick={handleSavePassword}
                        disabled={savingPassword}
                        className="btn-primary"
                      >
                        {savingPassword ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                        {savingPassword ? 'Đang lưu...' : 'Lưu mật khẩu'}
                      </button>
                    </div>
                  )}
                </div>

                {editingPassword ? (
                  <div className="mt-5 grid gap-4 md:grid-cols-3">
                    <ProfileField
                      label="Mật khẩu hiện tại"
                      icon={LockKeyhole}
                      type="password"
                      value={passwordForm.currentPassword}
                      onChange={(value) =>
                        setPasswordForm((current) => ({ ...current, currentPassword: value }))
                      }
                      placeholder="Nhập mật khẩu hiện tại"
                      disabled={savingPassword}
                    />
                    <ProfileField
                      label="Mật khẩu mới"
                      icon={ShieldCheck}
                      type="password"
                      value={passwordForm.newPassword}
                      onChange={(value) =>
                        setPasswordForm((current) => ({ ...current, newPassword: value }))
                      }
                      placeholder="Ít nhất 6 ký tự"
                      disabled={savingPassword}
                    />
                    <ProfileField
                      label="Xác nhận mật khẩu"
                      icon={ShieldCheck}
                      type="password"
                      value={passwordForm.confirmPassword}
                      onChange={(value) =>
                        setPasswordForm((current) => ({ ...current, confirmPassword: value }))
                      }
                      placeholder="Nhập lại mật khẩu mới"
                      disabled={savingPassword}
                    />
                  </div>
                ) : null}
              </div>

              <div className="grid gap-3">
                {securityItems.map((item) => (
                  <div
                    key={item}
                    className={cn(
                      'customer-soft-card-muted px-4 py-4 text-sm leading-6',
                      isDark ? 'text-slate-200' : 'text-slate-700',
                    )}
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </SectionCard>
        </div>

        <div className="space-y-5">
          <CustomerThemeSwitch />

          <SectionCard title="Phương thức thanh toán" eyebrow="Thanh toán">
            <div className="customer-soft-card px-4 py-4 sm:px-5 sm:py-5">
              <div className="flex items-start gap-3">
                <WalletCards className={cn('mt-1 h-5 w-5', isDark ? 'text-slate-300' : 'text-slate-500')} />
                <div>
                  <p className={cn('text-sm font-semibold', isDark ? 'text-white' : 'text-slate-950')}>
                    Phương thức thanh toán ưu tiên
                  </p>
                  <p className={cn('mt-2 text-sm leading-6', isDark ? 'text-slate-300' : 'text-slate-600')}>
                    {buildPaymentPreference(payments)}
                  </p>
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Địa điểm và hợp đồng" eyebrow="Hệ thống đang liên kết">
            <div className="grid gap-4">
              <div className="customer-soft-card-muted px-4 py-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
                  Địa chỉ lắp đặt
                </p>
                <p className={cn('mt-2 text-sm font-semibold leading-6', isDark ? 'text-white' : 'text-slate-900')}>
                  {installationAddress}
                </p>
              </div>
              <div className="customer-soft-card-muted px-4 py-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
                  Địa chỉ liên hệ / xuất hóa đơn
                </p>
                <p className={cn('mt-2 text-sm font-semibold leading-6', isDark ? 'text-white' : 'text-slate-900')}>
                  {billingAddress}
                </p>
              </div>
              <div className="customer-soft-card-muted px-4 py-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
                  Hệ thống chính
                </p>
                <p className={cn('mt-2 text-sm font-semibold leading-6', isDark ? 'text-white' : 'text-slate-900')}>
                  {primarySystem?.name || 'Chưa cập nhật'}
                </p>
                <p className={cn('mt-2 text-sm leading-6', isDark ? 'text-slate-300' : 'text-slate-600')}>
                  Provider: {primarySystem?.monitoringProvider || 'Chưa cấu hình'}
                </p>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Thông báo gần đây" eyebrow="Thông báo và vận hành">
            <div className="grid gap-3">
              {notifications.length ? (
                notifications.map((note) => (
                  <div
                    key={note.id}
                    className="customer-soft-card-muted px-4 py-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className={cn('flex items-center gap-2 text-sm font-semibold', isDark ? 'text-white' : 'text-slate-900')}>
                          <BellRing className="h-4 w-4" />
                          {note.title}
                        </p>
                        <p className={cn('mt-2 text-sm leading-6', isDark ? 'text-slate-300' : 'text-slate-600')}>
                          {note.body}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-slate-400">
                        {formatRelativeTime(note.createdAt)}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div
                  className={cn(
                    'customer-soft-card-muted px-4 py-4 text-sm leading-6',
                    isDark ? 'text-slate-300' : 'text-slate-600',
                  )}
                >
                  Chưa có thông báo mới. Hệ thống sẽ hiển thị cập nhật về hóa đơn, hỗ trợ và đồng
                  bộ sản lượng tại đây.
                </div>
              )}
            </div>
          </SectionCard>

          {error ? (
            <div
              className={cn(
                'rounded-[24px] border px-4 py-4 text-sm leading-6',
                isDark
                  ? 'border-amber-300/20 bg-amber-400/10 text-amber-100'
                  : 'border-amber-200 bg-amber-50 text-amber-800',
              )}
            >
              {error}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
