'use client';

import Link from 'next/link';
import { BrandLogo } from '@/components/brand-logo';
import { FooterSection } from '@/config/public-site';
import { usePublicSiteConfig } from '@/components/public-site-provider';
import { openPublicChat } from '@/lib/public-site-events';

function isExternalHref(href: string) {
  return (
    href.startsWith('http://') ||
    href.startsWith('https://') ||
    href.startsWith('mailto:') ||
    href.startsWith('tel:')
  );
}

export function PublicFooter() {
  const { siteConfig } = usePublicSiteConfig();
  const footerSections = (Array.isArray(siteConfig.footer.sections)
    ? (siteConfig.footer.sections as unknown[])
    : []
  ).filter(
    (section): section is FooterSection =>
      Boolean(
        section &&
          typeof section === 'object' &&
          'title' in section &&
          typeof (section as FooterSection).title === 'string' &&
          'links' in section &&
          Array.isArray((section as FooterSection).links),
      ),
  );

  return (
    <footer className="public-section-wide pb-8 sm:pb-10">
      <div className="surface-card-strong relative min-w-0 overflow-hidden px-5 py-7 sm:px-8 sm:py-8">
        <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-32 bg-[radial-gradient(circle_at_center,rgba(14,165,233,0.14),transparent_72%)] lg:block" />

        <div className="relative z-10 grid min-w-0 gap-8 xl:grid-cols-[1.18fr_0.82fr_0.82fr_0.9fr] xl:gap-6">
          <div className="min-w-0">
            <BrandLogo
              caption={siteConfig.footer.eyebrow}
              className="items-start gap-4"
              logoWrapClassName="bg-white/95"
            />
            <h3 className="mt-5 max-w-xl text-2xl font-semibold text-white sm:text-3xl">
              {siteConfig.footer.headline}
            </h3>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 [overflow-wrap:anywhere]">
              {siteConfig.footer.description}
            </p>

            <div className="mt-5 min-w-0 rounded-[22px] border border-white/10 bg-white/[0.04] px-4 py-4 text-sm leading-7 text-slate-300 [overflow-wrap:anywhere]">
              <p className="font-semibold text-white">{siteConfig.contact.legalCompanyLabel}</p>
              <p>{siteConfig.contact.addressLabel}</p>
              <p>{siteConfig.contact.businessHoursLabel}</p>
            </div>

            <div className="cta-row">
              <Link href={siteConfig.footer.ctaHref} className="btn-primary w-full sm:w-auto">
                {siteConfig.footer.ctaLabel}
              </Link>
              <button
                type="button"
                onClick={() => openPublicChat('contact')}
                className="btn-ghost w-full sm:w-auto"
              >
                {siteConfig.footer.secondaryCtaLabel}
              </button>
            </div>
          </div>

          {footerSections.map((section) => (
            <div key={section.title} className="min-w-0">
              {section.href ? (
                isExternalHref(section.href) ? (
                  <a
                    href={section.href}
                    className="block min-w-0 text-sm font-semibold text-white transition hover:text-slate-300 [overflow-wrap:anywhere]"
                  >
                    {section.title}
                  </a>
                ) : (
                  <Link
                    href={section.href}
                    className="block min-w-0 text-sm font-semibold text-white transition hover:text-slate-300 [overflow-wrap:anywhere]"
                  >
                    {section.title}
                  </Link>
                )
              ) : (
                <p className="text-sm font-semibold text-white [overflow-wrap:anywhere]">
                  {section.title}
                </p>
              )}

              <ul className="mt-3 min-w-0 space-y-2 text-sm leading-6 text-slate-300">
                {section.links
                  .filter(
                    (link): link is { label: string; href: string } =>
                      Boolean(link && typeof link.label === 'string' && typeof link.href === 'string'),
                  )
                  .map((link) => (
                  <li key={`${section.title}-${link.label}`}>
                    {isExternalHref(link.href) ? (
                      <a
                        href={link.href}
                        className="block min-w-0 transition hover:text-white [overflow-wrap:anywhere]"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        className="block min-w-0 transition hover:text-white [overflow-wrap:anywhere]"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className="min-w-0">
            <p className="text-sm font-semibold text-white">Liên hệ nhanh</p>
            <div className="mt-3 grid gap-3">
              <a href={siteConfig.contact.hotlineHref} className="btn-dark w-full">
                Gọi {siteConfig.contact.hotlineLabel}
              </a>
              <a href={siteConfig.contact.zaloHref} className="btn-ghost w-full">
                Chat Zalo
              </a>
              <a href={siteConfig.contact.emailHref} className="btn-ghost w-full">
                Gửi email
              </a>
            </div>
          </div>
        </div>

        <div className="mt-8 flex min-w-0 flex-col gap-3 border-t border-white/10 pt-5 text-xs tracking-[0.12em] text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p className="min-w-0 [overflow-wrap:anywhere]">{siteConfig.footer.copyright}</p>
          <div className="flex min-w-0 flex-wrap gap-4">
            {siteConfig.footer.legalLinks.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="min-w-0 transition hover:text-slate-300 [overflow-wrap:anywhere]"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
