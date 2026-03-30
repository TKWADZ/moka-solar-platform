'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { RotateCcw, Save } from 'lucide-react';
import { SectionCard } from '@/components/section-card';
import { usePublicSiteConfig } from '@/components/public-site-provider';
import {
  mergePublicSiteConfig,
  ManualPaymentRail,
  PublicSiteConfig,
  publicSiteConfig,
} from '@/config/public-site';
import {
  updateWebsiteSettingsRequest,
  websiteSettingsRequest,
} from '@/lib/api';

type JsonFieldState = {
  headerLinks: string;
  footerSections: string;
  legalLinks: string;
  faq: string;
  salesModels: string;
  solutionTracks: string;
};

type PaymentRailConfig = ManualPaymentRail;

function cloneConfig(config: PublicSiteConfig) {
  return JSON.parse(JSON.stringify(config)) as PublicSiteConfig;
}

function createJsonFieldState(config: PublicSiteConfig): JsonFieldState {
  return {
    headerLinks: JSON.stringify(config.navigation.headerLinks, null, 2),
    footerSections: JSON.stringify(config.footer.sections, null, 2),
    legalLinks: JSON.stringify(config.footer.legalLinks, null, 2),
    faq: JSON.stringify(config.homepage.faq, null, 2),
    salesModels: JSON.stringify(config.salesModels, null, 2),
    solutionTracks: JSON.stringify(config.solutionTracks, null, 2),
  };
}

function setConfigValue(
  config: PublicSiteConfig,
  path: string,
  value: unknown,
): PublicSiteConfig {
  const next = cloneConfig(config);
  const segments = path.split('.');
  let cursor: Record<string, unknown> = next as Record<string, unknown>;

  segments.slice(0, -1).forEach((segment) => {
    cursor = cursor[segment] as Record<string, unknown>;
  });

  cursor[segments[segments.length - 1]] = value;
  return next;
}

function resolvePaymentChannelKey(rail: PaymentRailConfig) {
  if (rail.key?.trim()) {
    return rail.key.trim().toUpperCase();
  }

  const source = `${rail.label || ''} ${rail.providerName || ''}`.toLowerCase();

  if (source.includes('momo')) {
    return 'MOMO_QR';
  }

  if (source.includes('vnpay')) {
    return 'VNPAY_QR';
  }

  return 'BANK_TRANSFER';
}

function buildPaymentPreviewNote(
  rail: PaymentRailConfig,
  invoiceNumber = 'INV-2026-0001',
  customerCode = 'CUS-2026032',
) {
  return (rail.noteTemplate || '')
    .replaceAll('{{invoiceNumber}}', invoiceNumber)
    .replaceAll('{{customerCode}}', customerCode)
    .trim();
}

function buildVietQrUrl(rail: PaymentRailConfig, amount: number, note: string) {
  if (!rail.supportsVietQr || !rail.vietQrBankId || !rail.accountNumber || amount <= 0) {
    return '';
  }

  const params = new URLSearchParams({
    amount: String(Math.round(amount)),
    addInfo: note,
    accountName: rail.accountName || '',
  });

  return `https://img.vietqr.io/image/${rail.vietQrBankId}-${rail.accountNumber}-compact2.png?${params.toString()}`;
}

export default function WebsiteSettingsPage() {
  const { refreshSiteConfig } = usePublicSiteConfig();
  const [config, setConfig] = useState<PublicSiteConfig>(publicSiteConfig);
  const [jsonFields, setJsonFields] = useState<JsonFieldState>(
    createJsonFieldState(publicSiteConfig),
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    websiteSettingsRequest()
      .then((record) => {
        const merged = mergePublicSiteConfig(
          record.content as Partial<PublicSiteConfig> | undefined,
        );
        setConfig(merged);
        setJsonFields(createJsonFieldState(merged));
      })
      .catch((requestError) =>
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Không thể tải cấu hình website.',
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  const jsonGuide = useMemo(
    () => [
      'navigation.headerLinks: menu public phía trên cùng',
      'footer.sections / legalLinks: nhóm link chân trang',
      'homepage.faq: câu hỏi thường gặp',
      'salesModels: card bảng giá + nội dung chi tiết',
      'solutionTracks: card giải pháp và phần mở rộng',
    ],
    [],
  );

  function updateField(path: string, value: unknown) {
    setConfig((current) => setConfigValue(current, path, value));
  }

  function updatePaymentRail(index: number, patch: Partial<PaymentRailConfig>) {
    setConfig((current) => {
      const next = cloneConfig(current);
      const rails = [...(next.payments.manual.rails as PaymentRailConfig[])];
      rails[index] = {
        ...rails[index],
        ...patch,
      } as PaymentRailConfig;
      next.payments.manual.rails = rails as typeof next.payments.manual.rails;
      return next;
    });
  }

  function setDefaultPaymentRail(index: number) {
    setConfig((current) => {
      const next = cloneConfig(current);
      next.payments.manual.rails = (next.payments.manual.rails as PaymentRailConfig[]).map(
        (rail, railIndex) =>
          ({
            ...rail,
            isDefault: railIndex === index,
          }) as PaymentRailConfig,
      ) as typeof next.payments.manual.rails;
      return next;
    });
  }

  function resetToDefaults() {
    const next = cloneConfig(publicSiteConfig);
    setConfig(next);
    setJsonFields(createJsonFieldState(next));
    setSuccess('');
    setError('');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const nextConfig = cloneConfig(config);
      nextConfig.navigation.headerLinks = JSON.parse(jsonFields.headerLinks);
      nextConfig.footer.sections = JSON.parse(jsonFields.footerSections);
      nextConfig.footer.legalLinks = JSON.parse(jsonFields.legalLinks);
      nextConfig.homepage.faq = JSON.parse(jsonFields.faq);
      nextConfig.salesModels = JSON.parse(jsonFields.salesModels);
      nextConfig.solutionTracks = JSON.parse(jsonFields.solutionTracks);

      await updateWebsiteSettingsRequest({
        content: nextConfig,
      });

      setConfig(nextConfig);
      setJsonFields(createJsonFieldState(nextConfig));
      setSuccess('Đã lưu cấu hình website và đồng bộ lại giao diện public.');
      await refreshSiteConfig();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Không thể lưu cấu hình website.',
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <SectionCard title="Cài đặt website" eyebrow="Quản trị website" dark>
        <p className="text-sm text-slate-300">Đang tải cấu hình website public...</p>
      </SectionCard>
    );
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <SectionCard
        title="Cài đặt website"
        eyebrow="Quản trị website"
        dark
        bodyClassName="space-y-4"
      >
        <div className="grid gap-3 xl:grid-cols-[1fr_auto] xl:items-start">
          <div className="portal-card-soft p-4 text-sm leading-7 text-slate-300">
            <p className="font-semibold text-white">Một nơi duy nhất để chỉnh website public.</p>
            <p className="mt-2">
              Logo, hotline, menu, footer, FAQ, pricing, CTA và link liên hệ đều được gom về đây.
              Sau khi lưu, public site sẽ đọc cấu hình mới mà không cần sửa code.
            </p>
          </div>

          <div className="grid gap-3 sm:flex sm:flex-wrap xl:justify-end">
            <Link href="/admin/media" className="btn-ghost w-full sm:w-auto">
              Mở thư viện ảnh
            </Link>
            <button
              type="button"
              className="btn-ghost w-full sm:w-auto"
              onClick={resetToDefaults}
            >
              <RotateCcw className="h-4 w-4" />
              Khôi phục mặc định
            </button>
            <button type="submit" className="btn-primary w-full sm:w-auto" disabled={saving}>
              <Save className="h-4 w-4" />
              {saving ? 'Đang lưu...' : 'Lưu cài đặt website'}
            </button>
          </div>
        </div>

        {success ? (
          <div className="rounded-[18px] border border-emerald-300/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-50">
            {success}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-[18px] border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-50">
            {error}
          </div>
        ) : null}
      </SectionCard>

      <div className="grid gap-5 2xl:grid-cols-[1.05fr_0.95fr]">
        <SectionCard title="Nhận diện & media" eyebrow="Logo và nhận diện" dark bodyClassName="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm text-slate-300">
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Tên thương hiệu</span>
              <input
                className="portal-field"
                value={config.brand.name}
                onChange={(event) => updateField('brand.name', event.target.value)}
              />
            </label>
            <label className="grid gap-2 text-sm text-slate-300">
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Pháp nhân</span>
              <input
                className="portal-field"
                value={config.brand.legalName}
                onChange={(event) => updateField('brand.legalName', event.target.value)}
              />
            </label>
          </div>

          <label className="grid gap-2 text-sm text-slate-300">
            <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Mô tả thương hiệu ngắn</span>
            <textarea
              className="portal-field min-h-[110px]"
              value={config.brand.platformLabel}
              onChange={(event) => updateField('brand.platformLabel', event.target.value)}
            />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm text-slate-300">
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Logo src</span>
              <input
                className="portal-field"
                value={config.brand.logo.src}
                onChange={(event) => updateField('brand.logo.src', event.target.value)}
              />
            </label>
            <label className="grid gap-2 text-sm text-slate-300">
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Logo alt</span>
              <input
                className="portal-field"
                value={config.brand.logo.alt}
                onChange={(event) => updateField('brand.logo.alt', event.target.value)}
              />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm text-slate-300">
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Favicon</span>
              <input
                className="portal-field"
                value={config.brand.media.favicon}
                onChange={(event) => updateField('brand.media.favicon', event.target.value)}
              />
            </label>
            <label className="grid gap-2 text-sm text-slate-300">
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">OG image</span>
              <input
                className="portal-field"
                value={config.brand.media.ogImage}
                onChange={(event) => updateField('brand.media.ogImage', event.target.value)}
              />
            </label>
          </div>
        </SectionCard>

        <SectionCard title="Liên hệ & CTA" eyebrow="Thông tin liên hệ và chốt lead" dark bodyClassName="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm text-slate-300">
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Tên công ty hiển thị</span>
              <input
                className="portal-field"
                value={config.contact.companyLabel}
                onChange={(event) => updateField('contact.companyLabel', event.target.value)}
              />
            </label>
            <label className="grid gap-2 text-sm text-slate-300">
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Tên pháp nhân hiển thị</span>
              <input
                className="portal-field"
                value={config.contact.legalCompanyLabel}
                onChange={(event) => updateField('contact.legalCompanyLabel', event.target.value)}
              />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm text-slate-300">
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Hotline hiển thị</span>
              <input
                className="portal-field"
                value={config.contact.hotlineLabel}
                onChange={(event) => updateField('contact.hotlineLabel', event.target.value)}
              />
            </label>
            <label className="grid gap-2 text-sm text-slate-300">
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Link gọi</span>
              <input
                className="portal-field"
                value={config.contact.hotlineHref}
                onChange={(event) => updateField('contact.hotlineHref', event.target.value)}
              />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm text-slate-300">
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Email hiển thị</span>
              <input
                className="portal-field"
                value={config.contact.emailLabel}
                onChange={(event) => updateField('contact.emailLabel', event.target.value)}
              />
            </label>
            <label className="grid gap-2 text-sm text-slate-300">
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Link email</span>
              <input
                className="portal-field"
                value={config.contact.emailHref}
                onChange={(event) => updateField('contact.emailHref', event.target.value)}
              />
            </label>
          </div>

          <label className="grid gap-2 text-sm text-slate-300">
            <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Địa chỉ</span>
            <textarea
              className="portal-field min-h-[92px]"
              value={config.contact.addressLabel}
              onChange={(event) => updateField('contact.addressLabel', event.target.value)}
            />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm text-slate-300">
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Giờ làm việc</span>
              <input
                className="portal-field"
                value={config.contact.businessHoursLabel}
                onChange={(event) => updateField('contact.businessHoursLabel', event.target.value)}
              />
            </label>
            <label className="grid gap-2 text-sm text-slate-300">
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Zalo</span>
              <input
                className="portal-field"
                value={config.contact.zaloHref}
                onChange={(event) => updateField('contact.zaloHref', event.target.value)}
              />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm text-slate-300">
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">CTA tư vấn</span>
              <input
                className="portal-field"
                value={config.ctas.consultation.label}
                onChange={(event) => updateField('ctas.consultation.label', event.target.value)}
              />
            </label>
            <label className="grid gap-2 text-sm text-slate-300">
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">CTA tư vấn href</span>
              <input
                className="portal-field"
                value={config.ctas.consultation.href}
                onChange={(event) => updateField('ctas.consultation.href', event.target.value)}
              />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm text-slate-300">
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">CTA đăng nhập</span>
              <input
                className="portal-field"
                value={config.ctas.login.label}
                onChange={(event) => updateField('ctas.login.label', event.target.value)}
              />
            </label>
            <label className="grid gap-2 text-sm text-slate-300">
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">CTA bảng giá</span>
              <input
                className="portal-field"
                value={config.ctas.pricing.label}
                onChange={(event) => updateField('ctas.pricing.label', event.target.value)}
              />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <label className="grid gap-2 text-sm text-slate-300">
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Hero CTA chính</span>
              <input
                className="portal-field"
                value={config.homepage.hero.primaryCtaLabel}
                onChange={(event) => updateField('homepage.hero.primaryCtaLabel', event.target.value)}
              />
            </label>
            <label className="grid gap-2 text-sm text-slate-300">
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Hero CTA phụ</span>
              <input
                className="portal-field"
                value={config.homepage.hero.secondaryCtaLabel}
                onChange={(event) => updateField('homepage.hero.secondaryCtaLabel', event.target.value)}
              />
            </label>
            <label className="grid gap-2 text-sm text-slate-300">
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Hero CTA gọi</span>
              <input
                className="portal-field"
                value={config.homepage.hero.tertiaryCtaLabel}
                onChange={(event) => updateField('homepage.hero.tertiaryCtaLabel', event.target.value)}
              />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm text-slate-300">
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">CTA cuối trang</span>
              <input
                className="portal-field"
                value={config.homepage.finalCta.primaryLabel}
                onChange={(event) => updateField('homepage.finalCta.primaryLabel', event.target.value)}
              />
            </label>
            <label className="grid gap-2 text-sm text-slate-300">
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">CTA cuối trang phụ</span>
              <input
                className="portal-field"
                value={config.homepage.finalCta.secondaryLabel}
                onChange={(event) => updateField('homepage.finalCta.secondaryLabel', event.target.value)}
              />
            </label>
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="Thanh toán thủ công"
        eyebrow="Hiển thị cho khách hàng trong portal"
        dark
        bodyClassName="grid gap-4"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm text-slate-300">
            <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Eyebrow</span>
            <input
              className="portal-field"
              value={config.payments.manual.eyebrow}
              onChange={(event) => updateField('payments.manual.eyebrow', event.target.value)}
            />
          </label>
          <label className="grid gap-2 text-sm text-slate-300">
            <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Tiêu đề</span>
            <input
              className="portal-field"
              value={config.payments.manual.title}
              onChange={(event) => updateField('payments.manual.title', event.target.value)}
            />
          </label>
        </div>

        <label className="grid gap-2 text-sm text-slate-300">
          <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Mô tả</span>
          <textarea
            className="portal-field min-h-[110px]"
            value={config.payments.manual.description}
            onChange={(event) => updateField('payments.manual.description', event.target.value)}
          />
        </label>

        <div className="grid gap-5 xl:grid-cols-2">
          {config.payments.manual.rails.map((rail, index) => (
            <div key={`${rail.label}-${index}`} className="portal-card-soft grid gap-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">Kênh thanh toán {index + 1}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Mã kênh: {resolvePaymentChannelKey(rail)}
                  </p>
                </div>
                <label className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={rail.isEnabled ?? true}
                    onChange={(event) => updatePaymentRail(index, { isEnabled: event.target.checked })}
                  />
                  Bật hiển thị
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <label className="grid gap-2 text-sm text-slate-300">
                  <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Thứ tự</span>
                  <input
                    type="number"
                    min={1}
                    className="portal-field"
                    value={rail.sortOrder ?? index + 1}
                    onChange={(event) =>
                      updatePaymentRail(index, { sortOrder: Number(event.target.value || index + 1) })
                    }
                  />
                </label>
                <label className="grid gap-2 text-sm text-slate-300">
                  <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Key</span>
                  <input
                    className="portal-field"
                    value={rail.key || ''}
                    onChange={(event) => updatePaymentRail(index, { key: event.target.value })}
                    placeholder={resolvePaymentChannelKey(rail)}
                  />
                </label>
                <label className="inline-flex items-center gap-2 rounded-[20px] border border-white/8 bg-white/[0.04] px-4 py-3 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={rail.isDefault ?? index === 0}
                    onChange={() => setDefaultPaymentRail(index)}
                  />
                  Đặt làm mặc định
                </label>
              </div>

              <label className="grid gap-2 text-sm text-slate-300">
                <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Tên hiển thị</span>
                <input
                  className="portal-field"
                  value={rail.label}
                  onChange={(event) =>
                    updateField(`payments.manual.rails.${index}.label`, event.target.value)
                  }
                />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2 text-sm text-slate-300">
                  <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Chủ tài khoản</span>
                  <input
                    className="portal-field"
                    value={rail.accountName}
                    onChange={(event) =>
                      updateField(`payments.manual.rails.${index}.accountName`, event.target.value)
                    }
                  />
                </label>
                <label className="grid gap-2 text-sm text-slate-300">
                  <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Số tài khoản / số ví</span>
                  <input
                    className="portal-field"
                    value={rail.accountNumber}
                    onChange={(event) =>
                      updateField(`payments.manual.rails.${index}.accountNumber`, event.target.value)
                    }
                  />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2 text-sm text-slate-300">
                  <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Ngân hàng / nhà cung cấp</span>
                  <input
                    className="portal-field"
                    value={rail.providerName}
                    onChange={(event) =>
                      updateField(`payments.manual.rails.${index}.providerName`, event.target.value)
                    }
                  />
                </label>
                <label className="grid gap-2 text-sm text-slate-300">
                  <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Chi nhánh / ghi chú phụ</span>
                  <input
                    className="portal-field"
                    value={rail.branch || ''}
                    onChange={(event) =>
                      updateField(`payments.manual.rails.${index}.branch`, event.target.value)
                    }
                  />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2 text-sm text-slate-300">
                  <span className="text-xs uppercase tracking-[0.18em] text-slate-500">QR image URL</span>
                  <input
                    className="portal-field"
                    value={rail.qrImage || ''}
                    onChange={(event) =>
                      updateField(`payments.manual.rails.${index}.qrImage`, event.target.value)
                    }
                  />
                </label>
                <label className="grid gap-2 text-sm text-slate-300">
                  <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Mẫu nội dung chuyển khoản</span>
                  <input
                    className="portal-field"
                    value={rail.noteTemplate}
                    onChange={(event) =>
                      updateField(`payments.manual.rails.${index}.noteTemplate`, event.target.value)
                    }
                  />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="inline-flex items-center gap-2 rounded-[20px] border border-white/8 bg-white/[0.04] px-4 py-3 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={rail.supportsVietQr ?? false}
                    onChange={(event) =>
                      updatePaymentRail(index, { supportsVietQr: event.target.checked })
                    }
                  />
                  Bật VietQR động
                </label>
                <label className="grid gap-2 text-sm text-slate-300">
                  <span className="text-xs uppercase tracking-[0.18em] text-slate-500">VietQR bank id</span>
                  <input
                    className="portal-field"
                    value={rail.vietQrBankId || ''}
                    onChange={(event) => updatePaymentRail(index, { vietQrBankId: event.target.value })}
                    placeholder="mbbank, vietcombank..."
                  />
                </label>
              </div>

              <div className="rounded-[22px] border border-white/8 bg-white/[0.04] p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Xem trước</p>
                <div className="mt-3 grid gap-3 text-sm text-slate-300">
                  <p>Nội dung chuyển khoản: {buildPaymentPreviewNote(rail) || 'Chưa có mẫu'}</p>
                  <p>Số tiền QR mẫu: 2.550.000 đ</p>
                </div>
                {buildVietQrUrl(rail, 2550000, buildPaymentPreviewNote(rail)) ? (
                  <img
                    src={buildVietQrUrl(rail, 2550000, buildPaymentPreviewNote(rail))}
                    alt={`Preview VietQR ${rail.label}`}
                    className="mx-auto mt-4 h-52 w-52 rounded-[22px] border border-white/10 bg-white object-contain p-3"
                  />
                ) : rail.qrImage ? (
                  <img
                    src={rail.qrImage}
                    alt={`Preview QR ${rail.label}`}
                    className="mx-auto mt-4 h-52 w-52 rounded-[22px] border border-white/10 bg-white object-contain p-3"
                  />
                ) : (
                  <p className="mt-4 text-xs leading-6 text-slate-500">
                    Chưa có QR. Customer portal sẽ fallback sang hiển thị thông tin chuyển khoản dạng chữ.
                  </p>
                )}
              </div>

              <p className="text-xs leading-6 text-slate-400">
                Có thể dùng biến <code className="rounded bg-white/10 px-1 py-0.5">{"{{invoiceNumber}}"}</code>{' '}
                và <code className="rounded bg-white/10 px-1 py-0.5">{"{{customerCode}}"}</code>{' '}
                để khách hàng copy nội dung thanh toán đúng hóa đơn.
              </p>
            </div>
          ))}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm text-slate-300">
            <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Tiêu đề xác nhận</span>
            <input
              className="portal-field"
              value={config.payments.manual.confirmationTitle}
              onChange={(event) =>
                updateField('payments.manual.confirmationTitle', event.target.value)
              }
            />
          </label>
          <label className="grid gap-2 text-sm text-slate-300">
            <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Nội dung xác nhận</span>
            <textarea
              className="portal-field min-h-[110px]"
              value={config.payments.manual.confirmationBody}
              onChange={(event) =>
                updateField('payments.manual.confirmationBody', event.target.value)
              }
            />
          </label>
        </div>
      </SectionCard>

      <div className="grid gap-5 2xl:grid-cols-[1fr_1fr]">
        <SectionCard title="Điều hướng & chân trang" eyebrow="Menu và chân trang" dark bodyClassName="grid gap-4">
          <label className="grid gap-2 text-sm text-slate-300">
            <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Header links JSON</span>
            <textarea
              className="portal-field min-h-[220px] font-mono text-xs leading-6"
              value={jsonFields.headerLinks}
              onChange={(event) =>
                setJsonFields((current) => ({ ...current, headerLinks: event.target.value }))
              }
            />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm text-slate-300">
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Footer headline</span>
              <textarea
                className="portal-field min-h-[110px]"
                value={config.footer.headline}
                onChange={(event) => updateField('footer.headline', event.target.value)}
              />
            </label>
            <label className="grid gap-2 text-sm text-slate-300">
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Footer description</span>
              <textarea
                className="portal-field min-h-[110px]"
                value={config.footer.description}
                onChange={(event) => updateField('footer.description', event.target.value)}
              />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <label className="grid gap-2 text-sm text-slate-300">
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Footer CTA label</span>
              <input
                className="portal-field"
                value={config.footer.ctaLabel}
                onChange={(event) => updateField('footer.ctaLabel', event.target.value)}
              />
            </label>
            <label className="grid gap-2 text-sm text-slate-300">
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Footer CTA href</span>
              <input
                className="portal-field"
                value={config.footer.ctaHref}
                onChange={(event) => updateField('footer.ctaHref', event.target.value)}
              />
            </label>
            <label className="grid gap-2 text-sm text-slate-300">
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Footer CTA chat</span>
              <input
                className="portal-field"
                value={config.footer.secondaryCtaLabel}
                onChange={(event) => updateField('footer.secondaryCtaLabel', event.target.value)}
              />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm text-slate-300">
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Footer sections JSON</span>
              <textarea
                className="portal-field min-h-[220px] font-mono text-xs leading-6"
                value={jsonFields.footerSections}
                onChange={(event) =>
                  setJsonFields((current) => ({ ...current, footerSections: event.target.value }))
                }
              />
            </label>
            <label className="grid gap-2 text-sm text-slate-300">
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Legal links JSON</span>
              <textarea
                className="portal-field min-h-[220px] font-mono text-xs leading-6"
                value={jsonFields.legalLinks}
                onChange={(event) =>
                  setJsonFields((current) => ({ ...current, legalLinks: event.target.value }))
                }
              />
            </label>
          </div>

          <label className="grid gap-2 text-sm text-slate-300">
            <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Copyright</span>
            <input
              className="portal-field"
              value={config.footer.copyright}
              onChange={(event) => updateField('footer.copyright', event.target.value)}
            />
          </label>
        </SectionCard>

        <SectionCard title="Bảng giá, FAQ & nội dung giải pháp" eyebrow="Nội dung bán hàng" dark bodyClassName="grid gap-4">
          <div className="grid gap-4 md:grid-cols-3">
            <label className="grid gap-2 text-sm text-slate-300">
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Hoàn vốn tham khảo (năm)</span>
              <input
                type="number"
                min={0}
                step="0.1"
                className="portal-field"
                value={config.pricingPolicy.estimatedPaybackYears}
                onChange={(event) =>
                  updateField(
                    'pricingPolicy.estimatedPaybackYears',
                    Number(event.target.value || 0),
                  )
                }
              />
            </label>
            <label className="grid gap-2 text-sm text-slate-300">
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Giá EVN cao nhất</span>
              <input
                type="number"
                min={0}
                step="1"
                className="portal-field"
                value={config.pricingPolicy.evnHighestTierPrice}
                onChange={(event) =>
                  updateField(
                    'pricingPolicy.evnHighestTierPrice',
                    Number(event.target.value || 0),
                  )
                }
              />
            </label>
            <label className="grid gap-2 text-sm text-slate-300">
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Giá Moka theo kWh</span>
              <input
                type="number"
                min={0}
                step="1"
                className="portal-field"
                value={config.pricingPolicy.mokaReferencePrice}
                onChange={(event) =>
                  updateField(
                    'pricingPolicy.mokaReferencePrice',
                    Number(event.target.value || 0),
                  )
                }
              />
            </label>
          </div>

          <label className="grid gap-2 text-sm text-slate-300">
            <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Mô tả giá EVN</span>
            <input
              className="portal-field"
              value={config.pricingPolicy.evnHighestTierLabel}
              onChange={(event) => updateField('pricingPolicy.evnHighestTierLabel', event.target.value)}
            />
          </label>

          <label className="grid gap-2 text-sm text-slate-300">
            <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Nhãn giá Moka</span>
            <input
              className="portal-field"
              value={config.pricingPolicy.mokaReferenceLabel}
              onChange={(event) => updateField('pricingPolicy.mokaReferenceLabel', event.target.value)}
            />
          </label>

          <label className="grid gap-2 text-sm text-slate-300">
            <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Ghi chú chính sách giá</span>
            <textarea
              className="portal-field min-h-[96px]"
              value={config.pricingPolicy.mokaReferenceNote}
              onChange={(event) => updateField('pricingPolicy.mokaReferenceNote', event.target.value)}
            />
          </label>

          <label className="grid gap-2 text-sm text-slate-300">
                    <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Ghi chú quy tắc tính phí</span>
            <textarea
              className="portal-field min-h-[96px]"
              value={config.pricingPolicy.billingRuleNote}
              onChange={(event) => updateField('pricingPolicy.billingRuleNote', event.target.value)}
            />
          </label>

          <label className="grid gap-2 text-sm text-slate-300">
            <span className="text-xs uppercase tracking-[0.18em] text-slate-500">FAQ JSON</span>
            <textarea
              className="portal-field min-h-[210px] font-mono text-xs leading-6"
              value={jsonFields.faq}
              onChange={(event) =>
                setJsonFields((current) => ({ ...current, faq: event.target.value }))
              }
            />
          </label>

          <label className="grid gap-2 text-sm text-slate-300">
            <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Pricing / sales models JSON</span>
            <textarea
              className="portal-field min-h-[260px] font-mono text-xs leading-6"
              value={jsonFields.salesModels}
              onChange={(event) =>
                setJsonFields((current) => ({ ...current, salesModels: event.target.value }))
              }
            />
          </label>

          <label className="grid gap-2 text-sm text-slate-300">
            <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Solution tracks JSON</span>
            <textarea
              className="portal-field min-h-[240px] font-mono text-xs leading-6"
              value={jsonFields.solutionTracks}
              onChange={(event) =>
                setJsonFields((current) => ({ ...current, solutionTracks: event.target.value }))
              }
            />
          </label>

          <div className="portal-card-soft p-4 text-xs leading-6 text-slate-400">
            <p className="font-semibold uppercase tracking-[0.18em] text-slate-500">
              Các khối JSON nên chỉnh ở đâu
            </p>
            <ul className="mt-3 space-y-2">
              {jsonGuide.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </SectionCard>
      </div>
    </form>
  );
}
