'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
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
import { getCustomerPrimaryNav } from '@/lib/customer-app';
import { featureCatalogRequest } from '@/lib/api';
import { getDefaultRouteForRole, getSession, hasRole, logout } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { FeaturePlugin, NavItem, SessionPayload, UserRole } from '@/types';

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

const navIconMap: Record<string, LucideIcon> = {
  '/admin': LayoutDashboard,
  '/admin/customers': Users2,
  '/admin/users': UserCog,
  '/admin/systems': SunMedium,
  '/admin/operations-data': FileSpreadsheet,
  '/admin/solarman': SatelliteDish,
  '/admin/deye': DatabaseZap,
  '/admin/contracts': FileText,
  '/admin/billing': CircleDollarSign,
  '/admin/ai': Bot,
  '/admin/website-settings': Palette,
  '/admin/media': Image,
  '/admin/cms': BookText,
  '/admin/leads': UserCog,
  '/admin/posts': Newspaper,
  '/admin/reports': BarChart3,
  '/admin/packages': Package2,
  '/admin/support': LifeBuoy,
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

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
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
        '/admin/systems',
        '/admin/operations-data',
        '/admin/solarman',
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
    { label: 'Hệ thống lõi', hrefs: ['/admin/ai', '/admin/plugins'] },
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
  pathname,
  navGroups,
  catalogWarning,
}: {
  session: SessionPayload;
  pathname: string;
  navGroups: NavGroup[];
  catalogWarning: string;
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
                const active = isActivePath(pathname, item.href);
                const Icon = navIconMap[item.href] || ChevronRight;

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
                      <p className="truncate text-sm font-semibold">{tt(item.label)}</p>
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

export function PortalShell({ title, kicker, nav, allowedRoles, children }: PortalShellProps) {
  const pathname = usePathname();
  const { tt } = useI18n();
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
        setCatalogWarning('Không thể tải danh mục module. Hệ thống đang dùng menu mặc định để bạn tiếp tục làm việc.');
      });

    return () => {
      active = false;
    };
  }, [roleKey]);

  const enabledKeys = new Set(
    featureCatalog
      .filter((plugin) => plugin.installed && plugin.enabled)
      .map((plugin) => plugin.key),
  );

  const visibleNav = featureCatalog.length
    ? nav.filter((item) => !item.featureKey || enabledKeys.has(item.featureKey))
    : nav;

  const navGroups = useMemo(() => groupPortalNav(visibleNav), [visibleNav]);
  const customerPrimaryNav = useMemo(
    () => (isCustomerPortal ? getCustomerPrimaryNav(visibleNav) : []),
    [isCustomerPortal, visibleNav],
  );

  const currentNavItem = visibleNav.find((item) => isActivePath(pathname, item.href));
  const currentFeatureDisabled =
    featureCatalog.length > 0 &&
    !!currentNavItem?.featureKey &&
    !enabledKeys.has(currentNavItem.featureKey);

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
            pathname={pathname}
            navGroups={navGroups}
            catalogWarning={catalogWarning}
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
                <button className="portal-card-soft flex h-11 w-11 items-center justify-center">
                  <Bell className="h-5 w-5 text-slate-200" />
                </button>
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
            {currentFeatureDisabled ? (
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
                  const active = isActivePath(pathname, item.href);
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
                pathname={pathname}
                navGroups={navGroups}
                catalogWarning={catalogWarning}
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
