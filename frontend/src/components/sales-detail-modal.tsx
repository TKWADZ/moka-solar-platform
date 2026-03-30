'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import {
  ArrowUpRight,
  MessageCircleMore,
  PhoneCall,
  ShieldCheck,
  Sparkles,
  Wrench,
  X,
} from 'lucide-react';
import { usePublicSiteConfig } from '@/components/public-site-provider';
import { SalesDetailContent, buildContactHref } from '@/config/public-site';
import { openPublicChat } from '@/lib/public-site-events';

type SalesDetailModalProps = {
  open: boolean;
  detail: SalesDetailContent | null;
  pricing?: string;
  badge?: string;
  onClose: () => void;
};

export function SalesDetailModal({
  open,
  detail,
  pricing,
  badge,
  onClose,
}: SalesDetailModalProps) {
  const { siteConfig } = usePublicSiteConfig();
  const bodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, open]);

  useEffect(() => {
    if (open) {
      bodyRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [detail?.title, open]);

  if (!open || !detail) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/78 p-2 backdrop-blur-sm sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Đóng chi tiết gói dịch vụ"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />

      <div className="surface-card-strong relative z-10 flex max-h-[calc(100dvh-16px)] w-full max-w-5xl flex-col overflow-hidden sm:max-h-[calc(100dvh-48px)]">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-white/10 px-4 py-4 sm:px-7 sm:py-5">
          <div>
            <p className="eyebrow text-slate-400">{detail.eyebrow}</p>
            <h3 className="mt-3 max-w-3xl text-2xl font-semibold text-white sm:text-4xl">
              {detail.title}
            </h3>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
              {detail.summary}
            </p>
          </div>

          <button
            type="button"
            aria-label="Đóng"
            className="rounded-full border border-white/10 bg-white/5 p-3 text-slate-200 transition hover:bg-white/10"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div
          ref={bodyRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-6 sm:px-7 sm:py-6 sm:pb-8"
        >
          <div className="grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
            <div className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="portal-card-soft p-4 sm:p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                    {detail.fitLabel}
                  </p>
                  <p className="mt-3 text-sm leading-7 text-slate-200">{detail.fitBody}</p>
                </div>

                <div className="portal-card-soft p-4 sm:p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                    {detail.pricingLabel}
                  </p>
                  <p className="mt-3 text-sm leading-7 text-slate-200">{detail.pricingBody}</p>
                </div>
              </div>

              <div className="portal-card-soft p-4 sm:p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                  {detail.exampleLabel}
                </p>
                <p className="mt-3 text-sm leading-7 text-slate-200">{detail.exampleBody}</p>
              </div>

              <div className="portal-card p-4 sm:p-5">
                <div className="flex items-center gap-3">
                  <span className="rounded-full border border-amber-300/20 bg-amber-400/10 p-2 text-amber-100">
                    <Sparkles className="h-4 w-4" />
                  </span>
                  <p className="text-base font-semibold text-white">Giá trị khách hàng nhận được</p>
                </div>
                <div className="mt-4 grid gap-3">
                  {detail.benefits.map((benefit) => (
                    <div
                      key={benefit}
                      className="rounded-[20px] border border-white/10 bg-white/[0.04] px-4 py-3 text-sm leading-7 text-slate-200"
                    >
                      {benefit}
                    </div>
                  ))}
                </div>
              </div>

              <div className="portal-card p-4 sm:p-5">
                <div className="flex items-center gap-3">
                  <span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 p-2 text-cyan-100">
                    <Wrench className="h-4 w-4" />
                  </span>
                  <p className="text-base font-semibold text-white">Vận hành và hỗ trợ</p>
                </div>
                <div className="mt-4 grid gap-3">
                  {detail.operations.map((operation) => (
                    <div
                      key={operation}
                      className="rounded-[20px] border border-white/10 bg-white/[0.04] px-4 py-3 text-sm leading-7 text-slate-200"
                    >
                      {operation}
                    </div>
                  ))}
                </div>
                <div className="mt-4 rounded-[20px] border border-emerald-300/20 bg-emerald-400/10 px-4 py-4 text-sm leading-7 text-emerald-50/90">
                  {detail.support}
                </div>
              </div>
            </div>

            <div className="grid gap-4">
              <div className="hero-panel px-5 py-5 sm:px-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="eyebrow text-slate-400">Gói đang xem</p>
                    <h4 className="mt-2 text-2xl font-semibold text-white">
                      Tư vấn theo đúng mô hình
                    </h4>
                  </div>
                  {badge ? (
                    <span className="rounded-full border border-amber-300/20 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-100">
                      {badge}
                    </span>
                  ) : null}
                </div>

                {pricing ? (
                  <div className="mt-5 rounded-[22px] border border-white/10 bg-white/[0.05] p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                      Mức giá tham khảo
                    </p>
                    <p className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-white">
                      {pricing}
                    </p>
                    <p className="mt-3 text-sm leading-6 text-slate-300">
                      {siteConfig.pricingPolicy.evnReferenceLabel}:{' '}
                      {new Intl.NumberFormat('vi-VN').format(
                        siteConfig.pricingPolicy.evnHighestTierPrice,
                      )}{' '}
                      đ/kWh.
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-300">
                      {siteConfig.pricingPolicy.mokaReferenceLabel}.{' '}
                      {siteConfig.pricingPolicy.mokaReferenceNote}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-300">
                      {siteConfig.pricingPolicy.billingRuleLabel}:{' '}
                      {siteConfig.pricingPolicy.billingRuleNote}
                    </p>
                  </div>
                ) : null}

                <div className="mt-5 rounded-[22px] border border-white/10 bg-black/18 p-4">
                  <div className="flex items-center gap-3">
                    <span className="rounded-full border border-white/10 bg-white/5 p-2 text-white">
                      <ShieldCheck className="h-4 w-4" />
                    </span>
                    <p className="text-sm font-semibold text-white">Quy trình triển khai</p>
                  </div>
                  <div className="mt-4 grid gap-3">
                    {detail.process.map((step, index) => (
                      <div
                        key={`${step}-${index}`}
                        className="flex gap-3 rounded-[18px] bg-white/[0.04] p-3"
                      >
                        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-xs font-semibold text-white">
                          {index + 1}
                        </span>
                        <p className="text-sm leading-7 text-slate-200">{step}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-white/10 bg-slate-950/78 px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+16px)] backdrop-blur-xl sm:px-7 sm:py-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-end">
            <button
              type="button"
              className="btn-primary w-full sm:w-auto"
              onClick={() => openPublicChat('contact', detail.ctaTopic)}
            >
              Nhận tư vấn ngay
              <MessageCircleMore className="ml-2 h-4 w-4" />
            </button>
            <Link
              href={buildContactHref(detail.ctaTopic, siteConfig)}
              className="btn-ghost w-full sm:w-auto"
            >
              Để lại thông tin
              <ArrowUpRight className="ml-2 h-4 w-4" />
            </Link>
            <a href={siteConfig.contact.hotlineHref} className="btn-dark w-full sm:w-auto">
              Gọi hotline
              <PhoneCall className="ml-2 h-4 w-4" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
