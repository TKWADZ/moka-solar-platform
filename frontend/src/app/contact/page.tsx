'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { PublicSection } from '@/components/public-layout';
import { PublicFooter } from '@/components/public-footer';
import { PublicFeatureGate } from '@/components/public-feature-gate';
import { PublicHeader } from '@/components/public-header';
import { usePublicSiteConfig } from '@/components/public-site-provider';
import { createContactInquiryRequest } from '@/lib/api';

export default function ContactPage() {
  const { siteConfig } = usePublicSiteConfig();
  const [topic, setTopic] = useState('');
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    companyName: '',
    siteCount: '',
    message: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const nextTopic = new URLSearchParams(window.location.search).get('topic')?.trim() || '';
    setTopic(nextTopic);

    if (!nextTopic) {
      return;
    }

    setForm((current) =>
      current.message
        ? current
        : {
            ...current,
            message: `Tôi muốn được tư vấn về: ${nextTopic}.`,
          },
    );
  }, []);

  const mailtoHref = useMemo(() => {
    const subject = encodeURIComponent(
      `Tư vấn điện mặt trời - ${form.companyName || form.fullName || 'Khách hàng từ website'}`,
    );
    const body = encodeURIComponent(
      [
        `Họ tên: ${form.fullName}`,
        `Email: ${form.email}`,
        `Điện thoại: ${form.phone || '-'}`,
        `Doanh nghiệp / công trình: ${form.companyName || '-'}`,
        `Số site: ${form.siteCount || '-'}`,
        '',
        form.message,
      ].join('\n'),
    );

    return `${siteConfig.contact.emailHref}?subject=${subject}&body=${body}`;
  }, [form, siteConfig.contact.emailHref]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      await createContactInquiryRequest({
        fullName: form.fullName,
        email: form.email,
        phone: form.phone || undefined,
        companyName: form.companyName || undefined,
        siteCount: form.siteCount || undefined,
        message: form.message,
        sourcePage: topic ? 'contact-topic' : 'contact',
      });

      setSuccess('Đã ghi nhận yêu cầu. Đội ngũ Moka Solar sẽ liên hệ sớm trong giờ làm việc.');
      setForm({
        fullName: '',
        email: '',
        phone: '',
        companyName: '',
        siteCount: '',
        message: '',
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Chưa thể gửi yêu cầu tư vấn.');
      window.location.href = mailtoHref;
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-w-0">
      <PublicHeader />
      <PublicFeatureGate featureKey="marketing_pages">
        <PublicSection density="tight">
          <div className="hero-panel min-w-0 px-5 py-7 sm:px-8 sm:py-8">
            <p className="eyebrow text-slate-400">Liên hệ tư vấn</p>
            <h1 className="mt-4 max-w-4xl text-4xl font-semibold leading-[0.96] text-white sm:text-6xl">
              Gửi yêu cầu tư vấn nhanh để Moka Solar đề xuất phương án phù hợp cho công trình của bạn.
            </h1>
            <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-300 sm:text-base sm:leading-8">
              Bạn có thể gọi trực tiếp, nhắn Zalo hoặc để lại thông tin qua form. Moka Solar phù hợp với
              nhóm khách hàng cần tư vấn rõ chi phí, mô hình triển khai và kế hoạch vận hành đủ thực tế
              để đi vào lắp đặt.
            </p>
          </div>
        </PublicSection>

        <PublicSection density="tight">
          <div className="public-grid-2">
            <div className="public-card-strong min-w-0">
              <p className="eyebrow text-slate-400">Thông tin doanh nghiệp</p>
              <h2 className="mt-3 text-2xl font-semibold text-white sm:text-3xl [overflow-wrap:anywhere]">
                {siteConfig.brand.name} - {siteConfig.brand.legalName}
              </h2>

              <div className="mt-5 grid min-w-0 gap-3 text-sm text-slate-300">
                <a
                  href={siteConfig.contact.hotlineHref}
                  className="min-w-0 rounded-[20px] border border-white/10 bg-white/[0.04] px-4 py-4 transition hover:bg-white/[0.07] [overflow-wrap:anywhere]"
                >
                  Hotline: {siteConfig.contact.hotlineLabel}
                </a>
                <a
                  href={siteConfig.contact.emailHref}
                  className="min-w-0 rounded-[20px] border border-white/10 bg-white/[0.04] px-4 py-4 transition hover:bg-white/[0.07] [overflow-wrap:anywhere]"
                >
                  Email: {siteConfig.contact.emailLabel}
                </a>
                <div className="min-w-0 rounded-[20px] border border-white/10 bg-white/[0.04] px-4 py-4 [overflow-wrap:anywhere]">
                  {siteConfig.contact.addressLabel}
                </div>
                <div className="min-w-0 rounded-[20px] border border-white/10 bg-white/[0.04] px-4 py-4 [overflow-wrap:anywhere]">
                  {siteConfig.contact.businessHoursLabel}
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <a href={siteConfig.contact.zaloHref} className="btn-ghost w-full">
                  Chat Zalo
                </a>
                <a href={siteConfig.contact.hotlineHref} className="btn-dark w-full">
                  Gọi ngay
                </a>
              </div>

              <div className="mt-5 min-w-0 rounded-[22px] border border-amber-300/20 bg-amber-400/10 px-4 py-4 text-sm leading-7 text-amber-50/90 [overflow-wrap:anywhere]">
                Mẹo để nhận tư vấn nhanh hơn: gửi kèm loại công trình, mức tiền điện mỗi tháng, địa chỉ
                lắp đặt dự kiến và nhu cầu về mô hình thanh toán.
              </div>
            </div>

            <div className="public-card min-w-0">
              <p className="eyebrow text-slate-400">Để lại thông tin</p>
              <h2 className="mt-3 text-2xl font-semibold text-white sm:text-3xl [overflow-wrap:anywhere]">
                Chúng tôi sẽ phản hồi trong khung giờ làm việc và bắt đầu từ một buổi tư vấn gọn, rõ.
              </h2>

              <form className="mt-5 grid min-w-0 gap-4" onSubmit={handleSubmit}>
                <input
                  className="portal-field"
                  placeholder="Họ và tên"
                  value={form.fullName}
                  onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))}
                  required
                />
                <div className="grid gap-4 md:grid-cols-2">
                  <input
                    className="portal-field"
                    placeholder="Email"
                    type="email"
                    value={form.email}
                    onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                    required
                  />
                  <input
                    className="portal-field"
                    placeholder="Số điện thoại / Zalo"
                    value={form.phone}
                    onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <input
                    className="portal-field"
                    placeholder="Tên doanh nghiệp / công trình"
                    value={form.companyName}
                    onChange={(event) => setForm((current) => ({ ...current, companyName: event.target.value }))}
                  />
                  <input
                    className="portal-field"
                    placeholder="Số site cần tư vấn (nếu có)"
                    value={form.siteCount}
                    onChange={(event) => setForm((current) => ({ ...current, siteCount: event.target.value }))}
                  />
                </div>
                <textarea
                  className="portal-field min-h-[180px]"
                  placeholder="Mô tả sơ bộ nhu cầu của bạn: loại công trình, tiền điện mỗi tháng, mong muốn về mô hình thanh toán hoặc bất kỳ điều gì bạn cần tư vấn."
                  value={form.message}
                  onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))}
                  required
                />
                {success ? (
                  <div className="rounded-[22px] border border-emerald-300/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-50">
                    {success}
                  </div>
                ) : null}
                {error ? (
                  <div className="rounded-[22px] border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-50">
                    {error}
                  </div>
                ) : null}
                <div className="cta-row mt-0">
                  <button className="btn-primary w-full sm:w-auto" type="submit" disabled={submitting}>
                    {submitting ? 'Đang gửi yêu cầu...' : 'Gửi yêu cầu tư vấn'}
                  </button>
                  <a href={mailtoHref} className="btn-ghost w-full sm:w-auto">
                    Gửi qua email
                  </a>
                </div>
              </form>
            </div>
          </div>
        </PublicSection>
      </PublicFeatureGate>

      <PublicFooter />
    </main>
  );
}
