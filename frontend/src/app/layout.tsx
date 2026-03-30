import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Manrope, Sora } from 'next/font/google';
import { FloatingChat } from '@/components/floating-chat';
import { PwaBootstrap } from '@/components/pwa-bootstrap';
import { PublicSiteProvider } from '@/components/public-site-provider';
import { publicSiteConfig } from '@/config/public-site';
import { I18nProvider } from '@/lib/i18n';

const manrope = Manrope({
  subsets: ['latin', 'vietnamese'],
  variable: '--font-body',
  display: 'swap',
});

const sora = Sora({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-display',
  display: 'swap',
});

const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL || 'https://mokasolar.com';

export const metadata: Metadata = {
  title: `${publicSiteConfig.brand.name} | Điện mặt trời cao cấp cho gia đình và doanh nghiệp`,
  description:
    'Moka Solar tư vấn, triển khai và vận hành điện mặt trời cho villa, homestay, quán cà phê, nhà hàng và doanh nghiệp nhỏ. Có mô hình thuê, PPA, trả góp và hybrid.',
  metadataBase: new URL(siteOrigin),
  alternates: {
    canonical: '/',
  },
  manifest: '/manifest.webmanifest',
  applicationName: 'Moka Solar',
  icons: {
    icon: publicSiteConfig.brand.media.favicon,
    apple: '/pwa/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Moka Solar',
  },
  openGraph: {
    title: `${publicSiteConfig.brand.name} | Điện mặt trời cao cấp cho gia đình và doanh nghiệp`,
    description:
      'Dịch vụ điện mặt trời cho villa, homestay, quán cà phê, nhà hàng và doanh nghiệp nhỏ do Công ty TNHH Truyền thông Moka vận hành.',
    url: siteOrigin,
    images: [publicSiteConfig.brand.media.ogImage],
  },
  keywords: [
    'Moka Solar',
    'điện mặt trời',
    'điện mặt trời villa',
    'điện mặt trời homestay',
    'thuê hệ thống điện mặt trời',
    'PPA điện mặt trời',
  ],
};

export const viewport: Viewport = {
  themeColor: '#08111f',
  colorScheme: 'dark',
  interactiveWidget: 'resizes-content',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body className={`${manrope.variable} ${sora.variable}`}>
        <I18nProvider>
          <PublicSiteProvider>
            <PwaBootstrap />
            {children}
            <FloatingChat />
          </PublicSiteProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
