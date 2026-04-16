'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BarChart3,
  Bell,
  Blocks,
  BookText,
  Bot,
  ChevronRight,
  CircleDollarSign,
  CreditCard,
  DatabaseZap,
  FileSpreadsheet,
  FileText,
  Image,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  LucideIcon,
  Menu,
  Newspaper,
  Package2,
  Palette,
  SatelliteDish,
  SunMedium,
  UserCog,
  Users2,
  X,
} from 'lucide-react';
import { CustomerAppInstallCard } from '@/components/customer-app-install-card';
import { LanguageSwitcher } from '@/components/language-switcher';
import { PortalLiveProvider, usePortalLive } from '@/components/portal-live-provider';
import { getCustomerPrimaryNav } from '@/lib/customer-app';
import { featureCatalogRequest } from '@/lib/api';
import {
  getDefaultRouteForRole,
  getSession,
  hasPermission,
  hasRole,
  logout,
  subscribeToSessionChange,
} from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import {
  FeaturePlugin,
  NavItem,
  PermissionCode,
  SessionPayload,
  UserRole,
} from '@/types';

type PortalShellProps = {
  title: string;
  kicker: string;
  nav: NavItem[];
  allowedRoles: UserRole[];
  children: React.ReactNode;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

type PortalShellContentProps = {
  title: string;
  kicker: string;
  session: SessionPayload;
  activeNavKey: string | null;
  navGroups: NavGroup[];
  catalogWarning: string;
  mobileNavOpen: boolean;
  setMobileNavOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isCustomerPortal: boolean;
  customerPrimaryNav: NavItem[];
  currentFeatureDisabled: boolean;
  currentNavForbidden: boolean;
  children: React.ReactNode;
};

type NotificationPanelPosition = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  mobile: boolean;
};

const navIconMap: Record<string, LucideIcon> = {
  '/admin': LayoutDashboard,
  '/admin/customers': Users2,
  '/admin/users': UserCog,
  '/admin/systems': SunMedium,
  '/admin/operations-data': FileSpreadsheet,
  '/admin/solarman': SatelliteDish,
  '/admin/luxpower': SatelliteDish,
  '/admin/deye': DatabaseZap,
  '/admin/contracts': FileText,
  '/admin/billing': CircleDollarSign,
  '/admin/zalo': Bell,
  '/admin/ai': Bot,
  '/admin/website-settings': Palette,
  '/admin/media': Image,
  '/admin/cms': BookText,
  '/admin/leads': UserCog,
  '/admin/posts': Newspaper,
  '/admin/reports': BarChart3,
  '/admin/packages': Package2,
  '/admin/support': LifeBuoy,
  '/admin/audit': FileText,
  '/admin/plugins': Blocks,
  '/customer': LayoutDashboard,
  '/customer/meters': FileSpreadsheet,
  '/customer/billing': CircleDollarSign,
  '/customer/payments': CreditCard,
  '/customer/systems': SunMedium,
  '/customer/contracts': FileText,
  '/customer/profile': UserCog,
  '/customer/support': LifeBuoy,
};

const navPermissionMap: Partial<Record<string, PermissionCode | PermissionCode[]>> = {
  '/admin': 'admin.dashboard.read',
  '/admin/customers': 'customers.read',
  '/admin/users': 'users.read',
  '/admin/systems': 'systems.read',
  '/admin/operations-data': 'systems.manage',
  '/admin/solarman': 'integrations.read',
  '/admin/luxpower': 'integrations.read',
  '/admin/deye': 'integrations.read',
  '/admin/contracts': 'contracts.read',
  '/admin/billing': 'billing.read',
  '/admin/zalo': 'integrations.read',
  '/admin/ai': 'ai.read',
  '/admin/website-settings': 'website.read',
  '/admin/media': 'website.read',
  '/admin/cms': 'website.read',
  '/admin/leads': 'customers.read',
  '/admin/posts': 'website.read',
  '/admin/reports': 'reports.read',
  '/admin/packages': 'contracts.manage',
  '/admin/support': 'support.read',
  '/admin/audit': 'audit.read',
};

function canAccessNavItem(session: SessionPayload | null, item: NavItem) {
  if (!session) {
    return false;
  }

  if (item.href === '/admin/plugins') {
    return ['SUPER_ADMIN', 'ADMIN'].includes(session.user.role);
  }

  const requiredPermission = navPermissionMap[item.href];
  if (!requiredPermission) {
    return true;
  }

  return hasPermission(session, requiredPermission);
}

const customerNavActivePaths: Record<string, string[]> = {
  '/customer': ['/customer', '/customer/overview'],
  '/customer/meters': ['/customer/meters', '/customer/meter', '/customer/chi-so-dien'],
  '/customer/billing': ['/customer/billing', '/customer/invoices'],
  '/customer/payments': ['/customer/payments'],
  '/customer/systems': ['/customer/systems', '/customer/system'],
  '/customer/contracts': ['/customer/contracts'],
  '/customer/profile': ['/customer/profile'],
  '/customer/support': ['/customer/support'],
};

function normalizePathname(pathname: string) {
  const normalized = pathname.replace(/\/+$/, '');
  return normalized || '/';
}

function resolveNavActiveKey(params: {
  pathname: string;
  nav: NavItem[];
  isCustomerPortal: boolean;
}) {
  const normalizedPathname = normalizePathname(params.pathname);

  if (params.isCustomerPortal) {
    for (const item of params.nav) {
      const activePaths = customerNavActivePaths[item.href] || [item.href];
      if (activePaths.includes(normalizedPathname)) {
        return item.href;
      }
    }

    return null;
  }

  const matchedItem = [...params.nav]
    .sort((left, right) => right.href.length - left.href.length)
    .find((item) => {
      const normalizedHref = normalizePathname(item.href);
      return normalizedPathname === normalizedHref || normalizedPathname.startsWith(`${normalizedHref}/`);
    });

  return matchedItem?.href || null;
}

function groupPortalNav(nav: NavItem[]) {
  const isAdminNav = nav.some((item) => item.href.startsWith('/admin'));

  if (!isAdminNav) {
    return [
      {
        label: 'Tổng quan dịch vụ',
        items: nav.filter((item) =>
          [
            '/customer',
            '/customer/meters',
            '/customer/billing',
            '/customer/payments',
            '/customer/systems',
            '/customer/contracts',
          ].includes(item.href),
        ),
      },
      {
        label: 'Tài khoản',
        items: nav.filter((item) => ['/customer/profile', '/customer/support'].includes(item.href)),
      },
    ].filter((group) => group.items.length);
  }

  const definitions: Array<{ label: string; hrefs: string[] }> = [
    { label: 'Điều hành', hrefs: ['/admin', '/admin/reports'] },
    {
      label: 'Kinh doanh và vận hành',
      hrefs: [
        '/admin/customers',
        '/admin/users',
        '/admin/contracts',
        '/admin/billing',
        '/admin/zalo',
        '/admin/systems',
        '/admin/operations-data',
        '/admin/solarman',
        '/admin/luxpower',
        '/admin/deye',
        '/admin/support',
      ],
    },
    {
      label: 'Nội dung và tăng trưởng',
      hrefs: [
        '/admin/leads',
        '/admin/website-settings',
        '/admin/media',
        '/admin/cms',
        '/admin/posts',
        '/admin/packages',
      ],
    },
    { label: 'Hệ thống lõi', hrefs: ['/admin/ai', '/admin/audit', '/admin/plugins'] },
  ];

  return definitions
    .map((definition) => ({
      label: definition.label,
      items: nav.filter((item) => definition.hrefs.includes(item.href)),
    }))
    .filter((group) => group.items.length);
}

function SidebarContent({
  session,
  activeNavKey,
  navGroups,
  catalogWarning,
  ticketUnreadCount,
}: {
  session: SessionPayload;
  activeNavKey: string | null;
  navGroups: NavGroup[];
  catalogWarning: string;
  ticketUnreadCount: number;
}) {
  const { tt } = useI18n();

  return (
    <>
      <div className="rounded-[24px] border border-white/8 bg-gradient-to-br from-white/[0.09] to-white/[0.03] p-5">
        <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
          {tt(session.user.role.replaceAll('_', ' '))}
        </p>
        <h2 className="mt-3 text-lg font-semibold text-white sm:text-xl">{session.user.fullName}</h2>
        <p className="mt-1 break-all text-sm text-slate-400">{session.user.email}</p>
        <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-300/15 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100">
          <span className="h-2 w-2 rounded-full bg-emerald-300" />
          Trực tuyến
        </div>
      </div>

      {catalogWarning ? (
        <div className="mt-4 rounded-[20px] border border-amber-200/15 bg-amber-400/10 px-4 py-3 text-sm leading-6 text-amber-100">
          {catalogWarning}
        </div>
      ) : null}

      <nav className="mt-5 space-y-5">
        {navGroups.map((group) => (
          <div key={group.label}>
            <p className="px-2 text-[11px] uppercase tracking-[0.22em] text-slate-500">{group.label}</p>
            <div className="mt-3 space-y-2">
              {group.items.map((item) => {
                const active = item.href === activeNavKey;
                const Icon = navIconMap[item.href] || ChevronRight;
                const supportBadgeCount =
                  (item.href === '/admin/support' || item.href === '/customer/support') &&
                  ticketUnreadCount > 0
                    ? ticketUnreadCount
                    : 0;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'group flex items-center gap-3 rounded-[20px] border px-4 py-3 transition sm:rounded-[22px] sm:py-3.5',
                      active
                        ? 'border-white/12 bg-white text-slate-950 shadow-[0_18px_44px_rgba(15,23,42,0.18)]'
                        : 'border-transparent bg-white/[0.03] text-slate-200 hover:border-white/8 hover:bg-white/[0.08]',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl transition sm:h-11 sm:w-11',
                        active
                          ? 'bg-slate-950 text-white'
                          : 'bg-white/[0.06] text-slate-300 group-hover:bg-white/[0.1]',
                      )}
                    >
                      <Icon className="h-4.5 w-4.5" />
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold">{tt(item.label)}</p>
                        {supportBadgeCount ? (
                          <span
                            className={cn(
                              'inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold',
                              active ? 'bg-slate-950 text-white' : 'bg-emerald-400/18 text-emerald-100',
                            )}
                          >
                            {supportBadgeCount > 99 ? '99+' : supportBadgeCount}
                          </span>
                        ) : null}
                      </div>
                      {item.description ? (
                        <p
                          className={cn(
                            'mt-1 line-clamp-2 text-xs leading-5',
                            active ? 'text-slate-600' : 'text-slate-400',
                          )}
                        >
                          {tt(item.description)}
                        </p>
                      ) : null}
                    </div>

                    <ChevronRight className={cn('h-4 w-4 shrink-0', active ? 'text-slate-500' : 'text-slate-600')} />
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </>
  );
}

function NotificationsBell() {
  const {
    notifications,
    notificationUnreadCount,
    ticketUnreadCount,
    isConnected,
    markAllNotificationsRead,
    markNotificationRead,
  } = usePortalLive();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [panelPosition, setPanelPosition] = useState<NotificationPanelPosition | null>(null);

  const totalBadge = notificationUnreadCount + ticketUnreadCount;

  useEffect(() => {
    if (!open) {
      setPanelPosition(null);
      return;
    }

    let frameId: number | null = null;

    const updatePosition = () => {
      const button = buttonRef.current;
      if (!button) {
        return;
      }

      const rect = button.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const mobile = viewportWidth < 640;
      const horizontalMargin = mobile ? 16 : 12;
      const verticalMargin = mobile ? 16 : 12;
      const gap = 12;
      const maxWidth = Math.max(280, viewportWidth - horizontalMargin * 2);
      const width = mobile ? maxWidth : Math.min(384, maxWidth);
      const rawLeft = mobile ? horizontalMargin : rect.right - width;
      const left = Math.min(
        Math.max(horizontalMargin, rawLeft),
        Math.max(horizontalMargin, viewportWidth - width - horizontalMargin),
      );
      const top = Math.min(
        Math.max(verticalMargin, rect.bottom + gap),
        Math.max(verticalMargin, viewportHeight - verticalMargin - 220),
      );
      const availableHeight = Math.max(0, viewportHeight - top - verticalMargin);
      const preferredMaxHeight = mobile ? Math.floor(viewportHeight * 0.7) : 560;
      const maxHeight =
        availableHeight < 180 ? availableHeight : Math.min(preferredMaxHeight, availableHeight);

      setPanelPosition({
        top,
        left,
        width,
        maxHeight,
        mobile,
      });
    };

    const schedulePositionUpdate = () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        updatePosition();
      });
    };

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }

      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) {
        return;
      }

      setOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    updatePosition();
    window.addEventListener('resize', schedulePositionUpdate);
    window.addEventListener('scroll', schedulePositionUpdate, true);
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      window.removeEventListener('resize', schedulePositionUpdate);
      window.removeEventListener('scroll', schedulePositionUpdate, true);
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="portal-card-soft relative flex h-11 w-11 items-center justify-center"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Mở thông báo"
      >
        <Bell className="h-5 w-5 text-slate-200" />
        {totalBadge > 0 ? (
          <span className="absolute -right-1 -top-1 inline-flex min-w-[1.3rem] items-center justify-center rounded-full bg-emerald-400 px-1.5 py-0.5 text-[10px] font-semibold text-slate-950">
            {totalBadge > 99 ? '99+' : totalBadge}
          </span>
        ) : null}
        <span
          className={cn(
            'absolute bottom-1.5 right-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-[#08111f]',
            isConnected ? 'bg-emerald-300' : 'bg-amber-300',
          )}
        />
      </button>

      {open && panelPosition
        ? createPortal(
            <div
              ref={panelRef}
              className={cn(
                'fixed z-[60] flex overflow-hidden rounded-[24px] border border-white/10 bg-[#08111f]/97 shadow-[0_24px_80px_rgba(2,6,23,0.44)] backdrop-blur-xl',
                panelPosition.mobile && 'rounded-[22px]',
              )}
              style={{
                top: `${panelPosition.top}px`,
                left: `${panelPosition.left}px`,
                width: `${panelPosition.width}px`,
                maxHeight: `${panelPosition.maxHeight}px`,
              }}
              role="dialog"
              aria-label="Thông báo"
            >
              <div className="flex min-h-0 w-full flex-col">
                <div className="flex items-center justify-between gap-3 border-b border-white/8 px-4 py-4">
                  <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Thông báo</p>
              <p className="mt-1 text-sm font-semibold text-white">
                {notificationUnreadCount
                  ? `${notificationUnreadCount} thông báo chưa đọc`
                  : 'Không có thông báo mới'}
              </p>
            </div>
            {notificationUnreadCount ? (
              <button
                type="button"
                onClick={() => void markAllNotificationsRead()}
                className="shrink-0 text-xs font-semibold text-emerald-200 transition hover:text-white"
              >
                Đánh dấu đã đọc
              </button>
            ) : null}
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            {notifications.length ? (
              <div className="space-y-2">
                {notifications.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      if (!item.isRead) {
                        void markNotificationRead(item.id);
                      }
                      if (item.linkHref) {
                        window.location.href = item.linkHref;
                      }
                    }}
                    className={cn(
                      'w-full rounded-[18px] border px-4 py-3 text-left transition',
                      item.isRead
                        ? 'border-white/6 bg-white/[0.03] text-slate-300'
                        : 'border-emerald-300/15 bg-emerald-400/10 text-white',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{item.title}</p>
                        <p className="mt-1 text-sm leading-6 text-slate-300">{item.body}</p>
                      </div>
                      {!item.isRead ? (
                        <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-300" />
                      ) : null}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-5 text-sm leading-6 text-slate-300">
                Chưa có thông báo mới. Ticket, phản hồi và cập nhật trạng thái sẽ hiện tại đây.
              </div>
            )}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function PortalShellContent({
  title,
  kicker,
  session,
  activeNavKey,
  navGroups,
  catalogWarning,
  mobileNavOpen,
  setMobileNavOpen,
  isCustomerPortal,
  customerPrimaryNav,
  currentFeatureDisabled,
  currentNavForbidden,
  children,
}: PortalShellContentProps) {
  const { tt } = useI18n();
  const { ticketUnreadCount } = usePortalLive();

  return (
    <main
      className={cn(
        'portal-shell min-h-screen px-2 py-2 sm:px-6 sm:py-5',
        isCustomerPortal && 'pb-[calc(6.3rem+env(safe-area-inset-bottom))] lg:pb-5',
      )}
    >
      <div className="mx-auto grid max-w-7xl gap-3 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-5">
        <aside className="portal-card hidden p-5 lg:block">
          <SidebarContent
            session={session}
            activeNavKey={activeNavKey}
            navGroups={navGroups}
            catalogWarning={catalogWarning}
            ticketUnreadCount={ticketUnreadCount}
          />
        </aside>

        <section className="min-w-0 space-y-3 sm:space-y-5">
          <div className="portal-card p-4 sm:p-6">
            <div className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">{tt(kicker)}</p>
                  <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-[2.1rem]">
                    {tt(title)}
                  </h1>
                  <p className="mt-2 text-sm text-slate-400 lg:hidden">
                    {session.user.fullName} • {tt(session.user.role.replaceAll('_', ' '))}
                  </p>
                </div>

                <div className="flex items-center gap-2 lg:hidden">
                  <button
                    type="button"
                    onClick={() => setMobileNavOpen(true)}
                    className="portal-card-soft flex h-11 w-11 items-center justify-center"
                    aria-label="Mở điều hướng"
                  >
                    <Menu className="h-5 w-5 text-slate-100" />
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <LanguageSwitcher dark />
                <NotificationsBell />
                <button
                  onClick={logout}
                  className="portal-card-soft inline-flex items-center gap-2 px-4 py-3 text-sm font-semibold text-slate-100"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="hidden sm:inline">Đăng xuất</span>
                  <span className="sm:hidden">Thoát</span>
                </button>
              </div>
            </div>
          </div>

          {isCustomerPortal ? <CustomerAppInstallCard /> : null}

          <div className="min-w-0 space-y-4 sm:space-y-5">
            {currentNavForbidden ? (
              <div className="portal-card p-6 sm:p-8">
                <p className="eyebrow">Quyen truy cap</p>
                <h2 className="mt-2 text-xl font-semibold text-white sm:text-2xl">
                  Ban khong co quyen vao module nay.
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                  Tai khoan hien tai chua du permissions cho khu vuc nay. Ban van co
                  the tiep tuc lam viec o cac module duoc cap quyen khac trong admin.
                </p>
              </div>
            ) : currentFeatureDisabled ? (
              <div className="portal-card p-6 sm:p-8">
                <p className="eyebrow">Hỗ trợ</p>
                <h2 className="mt-2 text-xl font-semibold text-white sm:text-2xl">Module này hiện đang bị tắt.</h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                  Hãy bật lại plugin liên quan trong trung tâm plugin để mở lại khu vực làm việc này.
                </p>
              </div>
            ) : (
              children
            )}
          </div>
        </section>
      </div>

      {isCustomerPortal && customerPrimaryNav.length ? (
        <div
          className="fixed inset-x-0 bottom-0 z-40 lg:hidden"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.35rem)' }}
        >
          <div className="mx-auto max-w-3xl px-2">
              <div className="rounded-[28px] border border-white/10 bg-[#08111f]/92 p-2 shadow-[0_24px_80px_rgba(2,6,23,0.46)] backdrop-blur-xl">
                <div className="grid grid-cols-5 gap-1">
                  {customerPrimaryNav.map((item) => {
                    const active = item.href === activeNavKey;
                    const Icon = navIconMap[item.href] || LayoutDashboard;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        'flex min-h-[62px] min-w-0 flex-col items-center justify-center gap-1 rounded-[20px] px-2 py-2 text-center transition',
                        active
                          ? 'bg-white text-slate-950 shadow-[0_12px_30px_rgba(255,255,255,0.14)]'
                          : 'text-slate-300 hover:bg-white/[0.08]',
                      )}
                    >
                      <Icon className="h-4.5 w-4.5 shrink-0" />
                      <span className="text-[11px] font-semibold leading-4">{tt(item.label)}</span>
                    </Link>
                  );
                })}

                <button
                  type="button"
                  onClick={() => setMobileNavOpen(true)}
                  className="flex min-h-[62px] min-w-0 flex-col items-center justify-center gap-1 rounded-[20px] px-2 py-2 text-center text-slate-300 transition hover:bg-white/[0.08]"
                  aria-label="Mở thêm mục"
                >
                  <Menu className="h-4.5 w-4.5 shrink-0" />
                  <span className="text-[11px] font-semibold leading-4">Menu</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {mobileNavOpen ? (
        <div
          className="fixed inset-0 z-50 bg-slate-950/68 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        >
          <div
            className="ml-auto flex h-full w-[min(92vw,380px)] flex-col border-l border-white/10 bg-[#08111f] p-4 shadow-[0_24px_80px_rgba(2,6,23,0.4)]"
            style={{
              paddingTop: 'max(env(safe-area-inset-top), 0.9rem)',
              paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)',
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 pb-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                  {isCustomerPortal ? 'Menu ứng dụng' : 'Điều hướng'}
                </p>
                <p className="mt-1 text-lg font-semibold text-white">{tt(title)}</p>
              </div>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="portal-card-soft flex h-11 w-11 items-center justify-center"
                aria-label="Đóng điều hướng"
              >
                <X className="h-5 w-5 text-slate-100" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <SidebarContent
                session={session}
                activeNavKey={activeNavKey}
                navGroups={navGroups}
                catalogWarning={catalogWarning}
                ticketUnreadCount={ticketUnreadCount}
              />
            </div>

            <button
              onClick={logout}
              className="mt-4 inline-flex items-center justify-center gap-2 rounded-full border border-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              <LogOut className="h-4 w-4" />
              Đăng xuất
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}

export function PortalShell({ title, kicker, nav, allowedRoles, children }: PortalShellProps) {
  const pathname = usePathname();
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [authState, setAuthState] = useState<'checking' | 'redirecting' | 'ready'>('checking');
  const [featureCatalog, setFeatureCatalog] = useState<FeaturePlugin[]>([]);
  const [catalogWarning, setCatalogWarning] = useState('');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const roleKey = allowedRoles.join('|');
  const isCustomerPortal = allowedRoles.length === 1 && allowedRoles[0] === 'CUSTOMER';

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    const allowedRoleList = roleKey.split('|') as UserRole[];
    const nextSession = getSession();

    if (!nextSession) {
      setAuthState('redirecting');
      window.location.replace('/login');
      return;
    }

    if (!hasRole(nextSession, allowedRoleList)) {
      setAuthState('redirecting');
      window.location.replace(getDefaultRouteForRole(nextSession.user.role));
      return;
    }

    setSession(nextSession);
    setAuthState('ready');

    let active = true;
    const unsubscribe = subscribeToSessionChange(({ session: updatedSession }) => {
      if (!active) {
        return;
      }

      const latestSession = updatedSession ?? getSession();

      if (!latestSession) {
        setSession(null);
        setAuthState('redirecting');
        window.location.replace('/login');
        return;
      }

      if (!hasRole(latestSession, allowedRoleList)) {
        setSession(null);
        setAuthState('redirecting');
        window.location.replace(getDefaultRouteForRole(latestSession.user.role));
        return;
      }

      setSession(latestSession);
      setAuthState('ready');
    });

    featureCatalogRequest()
      .then((plugins) => {
        if (!active) {
          return;
        }

        setFeatureCatalog(plugins);
        setCatalogWarning('');
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setFeatureCatalog([]);
        setCatalogWarning(
          'Không thể tải danh mục module. Hệ thống đang dùng menu mặc định để bạn tiếp tục làm việc.',
        );
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [roleKey]);

  const enabledKeys = new Set(
    featureCatalog.filter((plugin) => plugin.installed && plugin.enabled).map((plugin) => plugin.key),
  );

  const permissionVisibleNav = session
    ? nav.filter((item) => canAccessNavItem(session, item))
    : [];
  const visibleNav = featureCatalog.length
    ? permissionVisibleNav.filter((item) => !item.featureKey || enabledKeys.has(item.featureKey))
    : permissionVisibleNav;

  const navGroups = useMemo(() => groupPortalNav(visibleNav), [visibleNav]);
  const customerPrimaryNav = useMemo(
    () => (isCustomerPortal ? getCustomerPrimaryNav(visibleNav) : []),
    [isCustomerPortal, visibleNav],
  );
  const activeNavKey = useMemo(
    () =>
      resolveNavActiveKey({
        pathname,
        nav,
        isCustomerPortal,
      }),
    [isCustomerPortal, nav, pathname],
  );

  const requestedNavItem = nav.find((item) => item.href === activeNavKey) || null;
  const currentNavItem = visibleNav.find((item) => item.href === activeNavKey) || null;
  const currentNavForbidden = Boolean(
    session && requestedNavItem && !canAccessNavItem(session, requestedNavItem),
  );
  const currentFeatureDisabled =
    featureCatalog.length > 0 &&
    Boolean(currentNavItem?.featureKey) &&
    !enabledKeys.has(currentNavItem!.featureKey!);

  if (authState !== 'ready' || !session) {
    return (
      <main className="portal-shell flex min-h-screen items-center justify-center px-4 py-6">
        <div className="portal-card max-w-md px-6 py-6 text-center">
          <p className="eyebrow text-slate-500">
            {authState === 'redirecting' ? 'Đang chuyển hướng' : 'Đang xác thực'}
          </p>
          <h1 className="mt-3 text-xl font-semibold text-white">
            {authState === 'redirecting'
              ? 'Hệ thống đang đưa bạn đến đúng cổng làm việc.'
              : 'Đang chuẩn bị không gian làm việc của bạn.'}
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            {authState === 'redirecting'
              ? 'Nếu trang không tự chuyển, bạn có thể mở trang đăng nhập thủ công.'
              : 'Thông tin phiên đăng nhập đang được kiểm tra để tải đúng quyền truy cập.'}
          </p>
          {authState === 'redirecting' ? (
            <Link href="/login" className="btn-ghost mt-5 inline-flex">
              Mở trang đăng nhập
            </Link>
          ) : null}
        </div>
      </main>
    );
  }

  return (
    <PortalLiveProvider>
      <PortalShellContent
        title={title}
        kicker={kicker}
        session={session}
        activeNavKey={activeNavKey}
        navGroups={navGroups}
        catalogWarning={catalogWarning}
        mobileNavOpen={mobileNavOpen}
        setMobileNavOpen={setMobileNavOpen}
        isCustomerPortal={isCustomerPortal}
        customerPrimaryNav={customerPrimaryNav}
        currentFeatureDisabled={currentFeatureDisabled}
        currentNavForbidden={currentNavForbidden}
      >
        {children}
      </PortalShellContent>
    </PortalLiveProvider>
  );
}
