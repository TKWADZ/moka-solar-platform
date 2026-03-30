'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Menu, PhoneCall, X } from 'lucide-react';
import { BrandLogo } from '@/components/brand-logo';
import { usePublicSiteConfig } from '@/components/public-site-provider';
import { featureCatalogRequest } from '@/lib/api';
import { cn } from '@/lib/utils';
import { FeaturePlugin } from '@/types';

function isExternalHref(href: string) {
  return href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:') || href.startsWith('tel:');
}

export function PublicHeader() {
  const pathname = usePathname();
  const { siteConfig } = usePublicSiteConfig();
  const [catalog, setCatalog] = useState<FeaturePlugin[] | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [catalogFailed, setCatalogFailed] = useState(false);

  useEffect(() => {
    let mounted = true;

    featureCatalogRequest()
      .then((items) => {
        if (!mounted) {
          return;
        }

        setCatalog(items);
        setCatalogFailed(false);
      })
      .catch(() => {
        if (!mounted) {
          return;
        }

        setCatalog(null);
        setCatalogFailed(true);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  const enabledKeys = useMemo(() => new Set((catalog || []).map((plugin) => plugin.key)), [catalog]);

  const visibleLinks =
    catalog === null || catalogFailed
      ? siteConfig.navigation.headerLinks
      : siteConfig.navigation.headerLinks.filter(
          (item) => !item.featureKey || enabledKeys.has(item.featureKey),
        );

  return (
    <header className="sticky top-0 z-[90] pt-2 sm:pt-3">
      <div className="shell">
        <div className="surface-card-strong px-3 py-3 shadow-[0_26px_70px_rgba(2,6,23,0.34)] sm:px-5">
          <div className="flex items-center justify-between gap-3">
            <Link href="/" className="min-w-0">
              <BrandLogo
                compact
                priority
                caption={siteConfig.brand.platformLabel}
                className="gap-2.5"
                logoWrapClassName="bg-white/95"
                captionClassName="hidden xl:block"
              />
            </Link>

            <nav className="hidden items-center gap-2 xl:flex">
              {visibleLinks.map((item) => {
                const active =
                  item.href === '/'
                    ? pathname === '/'
                    : pathname === item.href || pathname.startsWith(`${item.href}/`);

                return (
                  <Link
                    key={`${item.href}-${item.label}`}
                    href={item.href}
                    className={cn(
                      'rounded-full px-4 py-2.5 text-sm font-semibold transition',
                      active
                        ? 'bg-white text-slate-950'
                        : 'text-slate-300 hover:bg-white/6 hover:text-white',
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="hidden items-center gap-3 xl:flex">
              <a
                href={siteConfig.contact.hotlineHref}
                className="inline-flex items-center justify-center rounded-full border border-white/12 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/8 hover:text-white"
              >
                <PhoneCall className="mr-2 h-4 w-4" />
                {siteConfig.contact.hotlineLabel}
              </a>
              <Link
                href={siteConfig.ctas.login.href}
                className="text-sm font-semibold text-slate-400 transition hover:text-white"
              >
                {siteConfig.ctas.login.label}
              </Link>
              <Link href={siteConfig.ctas.consultation.href} className="btn-primary">
                {siteConfig.ctas.consultation.label}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </div>

            <div className="flex items-center gap-2 xl:hidden">
              <a
                href={siteConfig.contact.hotlineHref}
                aria-label="Gọi hotline"
                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white transition hover:bg-white/10"
              >
                <PhoneCall className="h-5 w-5" />
              </a>
              <button
                type="button"
                onClick={() => setMobileMenuOpen((current) => !current)}
                aria-label={mobileMenuOpen ? 'Đóng menu' : 'Mở menu'}
                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white transition hover:bg-white/10"
              >
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {mobileMenuOpen ? (
            <div className="mt-4 rounded-[24px] border border-white/10 bg-white/[0.04] p-4 shadow-[0_18px_44px_rgba(2,6,23,0.18)] backdrop-blur xl:hidden">
              <div className="mb-4 border-b border-white/10 pb-4">
                <BrandLogo
                  compact
                  caption={siteConfig.brand.legalName}
                  className="gap-2.5"
                  logoWrapClassName="bg-white/95"
                />
                <p className="mt-3 text-sm leading-6 text-slate-300">
                  {siteConfig.contact.businessHoursLabel}. Hotline {siteConfig.contact.hotlineLabel}.
                </p>
              </div>

              <nav className="grid gap-2">
                {visibleLinks.map((item) =>
                  isExternalHref(item.href) ? (
                    <a
                      key={`${item.href}-${item.label}`}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className="rounded-[18px] px-4 py-3 text-sm font-semibold text-slate-100 transition hover:bg-white/8"
                    >
                      {item.label}
                    </a>
                  ) : (
                    <Link
                      key={`${item.href}-${item.label}`}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className="rounded-[18px] px-4 py-3 text-sm font-semibold text-slate-100 transition hover:bg-white/8"
                    >
                      {item.label}
                    </Link>
                  ),
                )}
              </nav>

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <a href={siteConfig.contact.hotlineHref} className="btn-dark w-full">
                  Gọi ngay
                </a>
                <a href={siteConfig.contact.zaloHref} className="btn-ghost w-full">
                  Chat Zalo
                </a>
              </div>

              <div className="mt-3 grid gap-2">
                <Link
                  href={siteConfig.ctas.consultation.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="btn-primary w-full"
                >
                  {siteConfig.ctas.consultation.label}
                </Link>
                <Link
                  href={siteConfig.ctas.login.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="px-3 py-2 text-center text-sm font-medium text-slate-400 transition hover:text-white"
                >
                  {siteConfig.ctas.login.label}
                </Link>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
