import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/customer',
    name: 'Moka Solar Customer',
    short_name: 'Moka Solar',
    description: 'Cổng khách hàng Moka Solar để theo dõi sản lượng, hóa đơn, thanh toán và hỗ trợ vận hành.',
    start_url: '/customer',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#08111f',
    theme_color: '#08111f',
    lang: 'vi',
    categories: ['business', 'utilities', 'productivity'],
    icons: [
      {
        src: '/pwa/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/pwa/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/pwa/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      {
        name: 'Tổng quan',
        short_name: 'Tổng quan',
        description: 'Mở nhanh dashboard khách hàng',
        url: '/customer',
        icons: [{ src: '/pwa/icon-192.png', sizes: '192x192' }],
      },
      {
        name: 'Hóa đơn',
        short_name: 'Hóa đơn',
        description: 'Xem hóa đơn và kỳ thanh toán gần nhất',
        url: '/customer/billing',
        icons: [{ src: '/pwa/icon-192.png', sizes: '192x192' }],
      },
      {
        name: 'Thanh toán',
        short_name: 'Thanh toán',
        description: 'Mở nhanh lịch sử giao dịch và xác nhận thanh toán',
        url: '/customer/payments',
        icons: [{ src: '/pwa/icon-192.png', sizes: '192x192' }],
      },
    ],
  };
}
