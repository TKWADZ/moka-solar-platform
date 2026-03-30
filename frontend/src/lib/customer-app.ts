import { NavItem } from '@/types';

export const CUSTOMER_PRIMARY_NAV_PATHS = [
  '/customer',
  '/customer/billing',
  '/customer/payments',
  '/customer/systems',
] as const;

export const CUSTOMER_SECONDARY_NAV_PATHS = [
  '/customer/meters',
  '/customer/contracts',
  '/customer/profile',
  '/customer/support',
] as const;

export const CUSTOMER_NOTIFICATION_TOPICS = [
  {
    key: 'payment_reminder',
    label: 'Nhắc thanh toán',
    description: 'Thông báo khi hóa đơn sắp đến hạn, đến hạn hoặc quá hạn.',
  },
  {
    key: 'data_update',
    label: 'Cập nhật dữ liệu',
    description: 'Thông báo khi dữ liệu sản lượng hoặc hóa đơn mới được cập nhật.',
  },
  {
    key: 'system_alert',
    label: 'Cảnh báo hệ thống',
    description: 'Thông báo khi hệ thống vận hành có cảnh báo hoặc cần kiểm tra.',
  },
] as const;

export function getCustomerPrimaryNav(nav: NavItem[]) {
  return nav.filter((item) =>
    CUSTOMER_PRIMARY_NAV_PATHS.includes(item.href as (typeof CUSTOMER_PRIMARY_NAV_PATHS)[number]),
  );
}

export function getCustomerSecondaryNav(nav: NavItem[]) {
  return nav.filter((item) =>
    CUSTOMER_SECONDARY_NAV_PATHS.includes(item.href as (typeof CUSTOMER_SECONDARY_NAV_PATHS)[number]),
  );
}

export function isStandaloneDisplayMode() {
  if (typeof window === 'undefined') {
    return false;
  }

  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIosDevice() {
  if (typeof navigator === 'undefined') {
    return false;
  }

  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}
