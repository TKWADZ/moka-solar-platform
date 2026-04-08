import {
  AiAssistantMessage,
  AiAssistantResponse,
  AiAssistantSettingsPayload,
  AiAssistantStatus,
  AiActionDraftRecord,
  AiActionRunResult,
  AdminDashboardData,
  AdminSystemRecord,
  CustomerStatus,
  ContactInquiryRecord,
  ContentPost,
  ContractRecord,
  CustomerRecord,
  CustomerDashboardData,
  PermissionCode,
  FeaturePlugin,
  DeyeConnectionRecord,
  DeyeSystemPreviewResponse,
  DeyeSyncLogRecord,
  InvoiceRecord,
  ImportOperationalDataResponse,
  MarketingPageRecord,
  MediaAssetRecord,
  MonthlyPvBillingRecord,
  MonitorSnapshot,
  NotificationRecord,
  NotificationUnreadSummary,
  OperationalOverviewResponse,
  PaymentRecord,
  AuditLogRecord,
  EntityAssignmentRecord,
  EntityTimelineResponse,
  InternalNoteRecord,
  LoginOtpRequestResult,
  RoleRecord,
  ServicePackageRecord,
  SessionPayload,
  LuxPowerConnectionRecord,
  LuxPowerSystemPreviewResponse,
  LuxPowerSystemSyncResponse,
  LuxPowerSyncLogRecord,
  LuxPowerSyncResponse,
  LuxPowerTestResponse,
  SolarmanConnectionRecord,
  SolarmanSyncLogRecord,
  SolarmanSyncResponse,
  SolarmanTestResponse,
  SystemOperationalRecordsResponse,
  SupportTicketRecord,
  SupportTicketUnreadSummary,
  TicketMessageRecord,
  UserRecord,
  UserRole,
  WebsiteAiChatResponse,
  WebsiteSettingRecord,
  ZaloMessageLogRecord,
  ZaloNotificationStatus,
  ZaloSendResult,
  ZaloSettingsRecord,
  ZaloTestResult,
  ZaloTemplateType,
} from '@/types';
import {
  adminContracts,
  adminCustomers,
  customerContracts,
  customerEnergyTrend,
  customerInvoices,
  customerNotifications,
  customerPayments,
  customerProfile,
  customerSystems,
  customerTickets,
  adminSystems,
  adminSummary,
  adminRevenueTrend,
  adminEnergyTrend,
} from '@/data/mock';
import { buildDefaultMarketingPages } from '@/data/marketing-cms';
import { PublicSiteConfig, publicSiteConfig } from '@/config/public-site';

const demoRolePermissions: Record<UserRole, PermissionCode[]> = {
  SUPER_ADMIN: [
    'admin.dashboard.read',
    'users.read',
    'users.manage',
    'users.archive',
    'customers.read',
    'customers.manage',
    'systems.read',
    'systems.manage',
    'contracts.read',
    'contracts.manage',
    'billing.read',
    'billing.manage',
    'payments.read',
    'payments.manage',
    'reports.read',
    'support.read',
    'support.reply',
    'support.assign',
    'support.internal_notes',
    'notifications.read',
    'audit.read',
    'internal_notes.read',
    'internal_notes.manage',
    'assignments.read',
    'assignments.manage',
    'activity.read',
    'website.read',
    'website.manage',
    'integrations.read',
    'integrations.execute',
    'integration.secrets.view',
    'integration.secrets.manage',
    'ai.read',
    'ai.manage',
  ],
  ADMIN: [
    'admin.dashboard.read',
    'users.read',
    'users.manage',
    'users.archive',
    'customers.read',
    'customers.manage',
    'systems.read',
    'systems.manage',
    'contracts.read',
    'contracts.manage',
    'billing.read',
    'billing.manage',
    'payments.read',
    'payments.manage',
    'reports.read',
    'support.read',
    'support.reply',
    'support.assign',
    'support.internal_notes',
    'notifications.read',
    'audit.read',
    'internal_notes.read',
    'internal_notes.manage',
    'assignments.read',
    'assignments.manage',
    'activity.read',
    'website.read',
    'website.manage',
    'integrations.read',
    'integrations.execute',
    'integration.secrets.view',
    'integration.secrets.manage',
    'ai.read',
    'ai.manage',
  ],
  MANAGER: [
    'admin.dashboard.read',
    'users.read',
    'customers.read',
    'customers.manage',
    'systems.read',
    'systems.manage',
    'contracts.read',
    'contracts.manage',
    'billing.read',
    'billing.manage',
    'payments.read',
    'payments.manage',
    'reports.read',
    'support.read',
    'support.reply',
    'support.assign',
    'support.internal_notes',
    'notifications.read',
    'audit.read',
    'internal_notes.read',
    'internal_notes.manage',
    'assignments.read',
    'assignments.manage',
    'activity.read',
    'website.read',
    'integrations.read',
    'integrations.execute',
    'ai.read',
  ],
  STAFF: [
    'admin.dashboard.read',
    'customers.read',
    'systems.read',
    'contracts.read',
    'billing.read',
    'payments.read',
    'reports.read',
    'support.read',
    'support.reply',
    'notifications.read',
    'activity.read',
    'assignments.read',
    'internal_notes.read',
  ],
  CUSTOMER: ['notifications.read'],
};

function normalizeApiBaseUrl(rawValue?: string) {
  const value = rawValue?.trim();

  if (!value) {
    return '/api';
  }

  if (value.startsWith('http://') || value.startsWith('https://')) {
    const normalized = value.replace(/\/$/, '');

    try {
      const parsed = new URL(normalized);
      return parsed.pathname === '/' ? `${normalized}/api` : normalized;
    } catch {
      return normalized;
    }
  }

  const normalizedPath = value.startsWith('/') ? value : `/${value}`;
  return normalizedPath === '/' ? '/api' : normalizedPath.replace(/\/$/, '');
}

const API_BASE_URL = normalizeApiBaseUrl(
  process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL,
);
const DEMO_FALLBACK_ENABLED = process.env.NEXT_PUBLIC_ENABLE_DEMO_FALLBACK === 'true';
const SESSION_KEY = 'moka_solar_session';
const MARKETING_PAGES_KEY = 'moka_solar_marketing_pages';
const WEBSITE_SETTINGS_KEY = 'moka_solar_website_settings';
const API_TIMEOUT_MS = 8000;

function isLoopbackHost(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function getApiBaseUrl() {
  if (typeof window === 'undefined') {
    return API_BASE_URL;
  }

  try {
    if (!API_BASE_URL.startsWith('http://') && !API_BASE_URL.startsWith('https://')) {
      return API_BASE_URL;
    }

    const parsed = new URL(API_BASE_URL);

    if (isLoopbackHost(parsed.hostname) && !isLoopbackHost(window.location.hostname)) {
      return parsed.pathname && parsed.pathname !== '/' ? parsed.pathname.replace(/\/$/, '') : '/api';
    }

    return API_BASE_URL;
  } catch {
    return API_BASE_URL;
  }
}

function createDemoSession(
  email: string | null,
  fullName: string,
  role: UserRole,
  customerId?: string,
  phone?: string | null,
): SessionPayload {
  return {
    accessToken: `demo-${role.toLowerCase()}-token`,
    refreshToken: `demo-${role.toLowerCase()}-refresh`,
    user: {
      id: `demo-${role.toLowerCase()}`,
      email,
      phone,
      fullName,
      role,
      permissions: demoRolePermissions[role],
      ...(customerId ? { customerId } : {}),
      secondFactorReady: role !== 'CUSTOMER',
    },
  };
}

function fallbackOrThrow<T>(error: unknown, fallback: () => T): T {
  if (DEMO_FALLBACK_ENABLED) {
    return fallback();
  }

  throw error;
}

function loadDemoMarketingPages() {
  const defaults = buildDefaultMarketingPages();

  if (typeof window === 'undefined') {
    return defaults;
  }

  try {
    const raw = window.localStorage.getItem(MARKETING_PAGES_KEY);
    if (!raw) {
      return defaults;
    }

    const parsed = JSON.parse(raw) as MarketingPageRecord[];
    return parsed.length ? parsed : defaults;
  } catch {
    return defaults;
  }
}

function saveDemoMarketingPages(pages: MarketingPageRecord[]) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(MARKETING_PAGES_KEY, JSON.stringify(pages));
  } catch {
    // Ignore local storage errors in demo mode.
  }
}

function loadDemoWebsiteSettings(): WebsiteSettingRecord<Partial<PublicSiteConfig>> {
  const fallback: WebsiteSettingRecord<Partial<PublicSiteConfig>> = {
    id: 'website-settings-demo',
    key: 'public_site',
    name: 'Website public settings',
    description: 'Demo fallback for public website configuration.',
    content: publicSiteConfig,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  };

  if (typeof window === 'undefined') {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(WEBSITE_SETTINGS_KEY);
    if (!raw) {
      return fallback;
    }

    return {
      ...fallback,
      ...(JSON.parse(raw) as WebsiteSettingRecord<Partial<PublicSiteConfig>>),
    };
  } catch {
    return fallback;
  }
}

function saveDemoWebsiteSettings(record: WebsiteSettingRecord<Partial<PublicSiteConfig>>) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(WEBSITE_SETTINGS_KEY, JSON.stringify(record));
  } catch {
    // Ignore local storage errors in demo mode.
  }
}

const demoSessions = Object.fromEntries(
  [
    {
      email: process.env.NEXT_PUBLIC_SAMPLE_SUPERADMIN_EMAIL || '',
      password: process.env.NEXT_PUBLIC_SAMPLE_SUPERADMIN_PASSWORD || '',
      session: createDemoSession(
        process.env.NEXT_PUBLIC_SAMPLE_SUPERADMIN_EMAIL || '',
        'Moka Super Admin',
        'SUPER_ADMIN',
      ),
    },
    {
      email: process.env.NEXT_PUBLIC_SAMPLE_ADMIN_EMAIL || '',
      password: process.env.NEXT_PUBLIC_SAMPLE_ADMIN_PASSWORD || '',
      session: createDemoSession(
        process.env.NEXT_PUBLIC_SAMPLE_ADMIN_EMAIL || '',
        'Moka Operations Admin',
        'ADMIN',
      ),
    },
    {
      email: process.env.NEXT_PUBLIC_SAMPLE_CUSTOMER_EMAIL || '',
      password: process.env.NEXT_PUBLIC_SAMPLE_CUSTOMER_PASSWORD || '',
      session: createDemoSession(
        process.env.NEXT_PUBLIC_SAMPLE_CUSTOMER_EMAIL || '',
        'Nguyen Van A',
        'CUSTOMER',
        'demo-customer-001',
      ),
    },
  ]
    .filter((item) => item.email && item.password)
    .map((item) => [item.email.trim().toLowerCase(), item]),
) as Record<
  string,
  {
    email: string;
    password: string;
    session: SessionPayload;
  }
>;

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token =
    typeof window !== 'undefined'
      ? (() => {
          try {
            const raw = window.localStorage.getItem(SESSION_KEY);
            if (!raw) return '';
            return (JSON.parse(raw) as SessionPayload).accessToken || '';
          } catch {
            return '';
          }
        })()
      : '';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  let response: Response;

  try {
    const isFormDataBody =
      typeof FormData !== 'undefined' && options?.body instanceof FormData;

    response = await fetch(`${getApiBaseUrl()}${path}`, {
      ...options,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(!isFormDataBody ? { 'Content-Type': 'application/json' } : {}),
        ...(options?.headers || {}),
      },
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeout);

    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Yêu cầu tới máy chủ mất quá nhiều thời gian. Vui lòng thử lại.');
    }

    throw error;
  }

  clearTimeout(timeout);

  if (!response.ok) {
    let message = `API Error: ${response.status}`;

    try {
      const body = await response.json();
      if (typeof body?.message === 'string') {
        message = body.message;
      } else if (Array.isArray(body?.message) && body.message.length) {
        message = body.message.join(', ');
      }
    } catch {
      // Ignore response parsing errors and keep the HTTP status message.
    }

    throw new Error(message);
  }

  return response.json();
}

export async function loginRequest(identifier: string, password: string) {
  try {
    return await apiFetch<SessionPayload>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    });
  } catch (error) {
    const normalizedIdentifier = identifier.trim().toLowerCase();
    const demoAccount = demoSessions[normalizedIdentifier];

    if (
      DEMO_FALLBACK_ENABLED &&
      demoAccount &&
      password === demoAccount.password
    ) {
      return demoAccount.session;
    }

    throw error;
  }
}

export async function requestLoginOtpRequest(identifier: string) {
  return apiFetch<LoginOtpRequestResult>('/auth/login-otp/request', {
    method: 'POST',
    body: JSON.stringify({ phone: identifier }),
  });
}

export async function verifyLoginOtpRequest(
  identifier: string,
  otpCode: string,
  requestId: string,
) {
  return apiFetch<SessionPayload>('/auth/login-otp/verify', {
    method: 'POST',
    body: JSON.stringify({ phone: identifier, otpCode, requestId }),
  });
}

export async function requestRegisterOtpRequest(payload: {
  fullName: string;
  phone: string;
  email?: string;
}) {
  return apiFetch<LoginOtpRequestResult>('/auth/register-otp/request', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function verifyRegisterOtpRequest(payload: {
  phone: string;
  otpCode: string;
  requestId: string;
  password: string;
}) {
  return apiFetch<SessionPayload>('/auth/register-otp/verify', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function requestPasswordResetOtpRequest(phone: string) {
  return apiFetch<LoginOtpRequestResult>('/auth/password-reset/request', {
    method: 'POST',
    body: JSON.stringify({ phone }),
  });
}

export async function resetPasswordWithOtpRequest(payload: {
  phone: string;
  otpCode: string;
  requestId: string;
  password: string;
}) {
  return apiFetch<SessionPayload>('/auth/password-reset/verify', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function registerRequest(payload: {
  email?: string;
  password: string;
  fullName: string;
  phone?: string;
}) {
  try {
    return await apiFetch<SessionPayload>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  } catch (error) {
    return fallbackOrThrow(error, () => ({
      accessToken: 'demo-register-token',
      refreshToken: 'demo-register-refresh',
      user: {
        id: 'demo-self-register',
        email: payload.email || null,
        phone: payload.phone || null,
        fullName: payload.fullName,
        role: 'CUSTOMER' as UserRole,
        customerId: 'demo-customer-self',
        secondFactorReady: false,
      },
    }));
  }
}

const demoFeaturePlugins: FeaturePlugin[] = [
  {
    id: 'plugin-center',
    key: 'plugin_center',
    name: 'Plugin Center',
    description: 'Registry and configuration editor for all installable product capabilities.',
    category: 'platform',
    version: '1.0.0',
    installed: true,
    enabled: true,
    editable: false,
    isCore: true,
    routePath: '/admin/plugins',
    areas: ['admin'],
    sortOrder: 1,
    config: { routes: ['/admin/plugins'] },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  },
  {
    id: 'plugin-admin-dashboard',
    key: 'admin_dashboard',
    name: 'Admin Dashboard',
    description: 'Portfolio KPI cockpit for operations leaders and supervisors.',
    category: 'admin',
    version: '1.0.0',
    installed: true,
    enabled: true,
    editable: true,
    isCore: true,
    routePath: '/admin',
    areas: ['admin'],
    sortOrder: 10,
    config: { routes: ['/admin'] },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  },
  {
    id: 'plugin-website-settings',
    key: 'website_settings',
    name: 'Website Settings',
    description: 'Centralized public website settings for logo, hotline, menu, pricing and footer.',
    category: 'public',
    version: '1.0.0',
    installed: true,
    enabled: true,
    editable: true,
    isCore: false,
    routePath: '/admin/website-settings',
    areas: ['admin'],
    sortOrder: 16,
    config: { routes: ['/admin/website-settings'], apiPrefixes: ['/website-settings'] },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  },
  {
    id: 'plugin-media-library',
    key: 'media_library',
    name: 'Media Library',
    description: 'Upload, classify and reuse images across website, CMS and admin workflows.',
    category: 'platform',
    version: '1.0.0',
    installed: true,
    enabled: true,
    editable: true,
    isCore: false,
    routePath: '/admin/media',
    areas: ['admin'],
    sortOrder: 18,
    config: { routes: ['/admin/media'], apiPrefixes: ['/media'] },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  },
  {
    id: 'plugin-customer-dashboard',
    key: 'customer_dashboard',
    name: 'Customer Dashboard',
    description: 'High-level customer portal experience with energy and savings overview.',
    category: 'customer',
    version: '1.0.0',
    installed: true,
    enabled: true,
    editable: true,
    isCore: true,
    routePath: '/customer',
    areas: ['customer'],
    sortOrder: 20,
    config: { routes: ['/customer'] },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  },
  {
    id: 'plugin-customers',
    key: 'customers',
    name: 'Customers',
    description: 'Customer account creation, segmentation and profile management.',
    category: 'operations',
    version: '1.0.0',
    installed: true,
    enabled: true,
    editable: true,
    isCore: false,
    routePath: '/admin/customers',
    areas: ['admin'],
    sortOrder: 30,
    config: { routes: ['/admin/customers'], apiPrefixes: ['/customers'] },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  },
  {
    id: 'plugin-users',
    key: 'users',
    name: 'Users & Roles',
    description: 'Internal user management, role assignment and access delegation for operations teams.',
    category: 'platform',
    version: '1.0.0',
    installed: true,
    enabled: true,
    editable: true,
    isCore: false,
    routePath: '/admin/users',
    areas: ['admin'],
    sortOrder: 35,
    config: { routes: ['/admin/users'], apiPrefixes: ['/users', '/roles'] },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  },
  {
    id: 'plugin-systems',
    key: 'systems',
    name: 'Systems',
    description: 'Solar asset inventory, site performance and inverter metadata.',
    category: 'operations',
    version: '1.0.0',
    installed: true,
    enabled: true,
    editable: true,
    isCore: false,
    routePath: '/admin/systems',
    areas: ['admin', 'customer'],
    sortOrder: 40,
    config: { routes: ['/admin/systems', '/customer/systems'], apiPrefixes: ['/systems'] },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  },
  {
    id: 'plugin-operational-data',
    key: 'operational_data',
    name: 'Operational Data',
    description: 'Manual-first monthly operating data, CSV import and semi-automatic portfolio updates.',
    category: 'operations',
    version: '1.0.0',
    installed: true,
    enabled: true,
    editable: true,
    isCore: false,
    routePath: '/admin/operations-data',
    areas: ['admin'],
    sortOrder: 42,
    config: { routes: ['/admin/operations-data'], apiPrefixes: ['/operational-data'] },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  },
  {
    id: 'plugin-solarman-connections',
    key: 'solarman_connections',
    name: 'SOLARMAN',
    description: 'Customer-account integration for SOLARMAN station discovery, monthly PV sync and billing ingestion.',
    category: 'operations',
    version: '1.0.0',
    installed: true,
    enabled: true,
    editable: true,
    isCore: false,
    routePath: '/admin/solarman',
    areas: ['admin'],
    sortOrder: 45,
    config: { routes: ['/admin/solarman'], apiPrefixes: ['/solarman-connections'] },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  },
  {
    id: 'plugin-luxpower-connections',
    key: 'luxpower_connections',
    name: 'LuxPower Cloud',
    description: 'Backend-only LuxPower cloud session integration for monitor snapshots, battery SOC and inverter health sync.',
    category: 'operations',
    version: '1.0.0',
    installed: true,
    enabled: true,
    editable: true,
    isCore: false,
    routePath: '/admin/luxpower',
    areas: ['admin'],
    sortOrder: 46,
    config: { routes: ['/admin/luxpower'], apiPrefixes: ['/luxpower-connections'] },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  },
  {
    id: 'plugin-contracts',
    key: 'contracts',
    name: 'Contracts',
    description: 'Commercial contract lifecycle, attached files and pricing terms.',
    category: 'operations',
    version: '1.0.0',
    installed: true,
    enabled: true,
    editable: true,
    isCore: false,
    routePath: '/admin/contracts',
    areas: ['admin', 'customer'],
    sortOrder: 50,
    config: { routes: ['/admin/contracts', '/customer/contracts'], apiPrefixes: ['/contracts'] },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  },
  {
    id: 'plugin-billing',
    key: 'billing',
    name: 'Billing',
    description: 'Invoice generation, PDF export and billing operations across contract models.',
    category: 'finance',
    version: '1.0.0',
    installed: true,
    enabled: true,
    editable: true,
    isCore: false,
    routePath: '/admin/billing',
    areas: ['admin', 'customer'],
    sortOrder: 70,
    config: { routes: ['/admin/billing', '/admin/zalo', '/customer/billing'], apiPrefixes: ['/invoices', '/zalo-notifications'] },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  },
  {
    id: 'plugin-payments',
    key: 'payments',
    name: 'Payments',
    description: 'Online gateway flows, reconciliation and payment history.',
    category: 'finance',
    version: '1.0.0',
    installed: true,
    enabled: true,
    editable: true,
    isCore: false,
    routePath: '/customer/payments',
    areas: ['admin', 'customer'],
    sortOrder: 80,
    config: { routes: ['/customer/payments'], apiPrefixes: ['/payments'] },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  },
  {
    id: 'plugin-support',
    key: 'support',
    name: 'Support',
    description: 'Ticket intake, SLA handling and issue response workflows.',
    category: 'operations',
    version: '1.0.0',
    installed: true,
    enabled: true,
    editable: true,
    isCore: false,
    routePath: '/admin/support',
    areas: ['admin', 'customer'],
    sortOrder: 90,
    config: { routes: ['/admin/support', '/customer/support'], apiPrefixes: ['/support-tickets'] },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  },
  {
    id: 'plugin-reports',
    key: 'reports',
    name: 'Reports',
    description: 'Revenue, energy and collection analytics for management reporting.',
    category: 'analytics',
    version: '1.0.0',
    installed: true,
    enabled: true,
    editable: true,
    isCore: false,
    routePath: '/admin/reports',
    areas: ['admin'],
    sortOrder: 100,
    config: { routes: ['/admin/reports'], apiPrefixes: ['/reports'] },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  },
  {
    id: 'plugin-service-packages',
    key: 'service_packages',
    name: 'Service Packages',
    description: 'Commercial product packaging, VAT rules and pricing strategy editor.',
    category: 'product',
    version: '1.0.0',
    installed: true,
    enabled: true,
    editable: true,
    isCore: false,
    routePath: '/admin/packages',
    areas: ['admin'],
    sortOrder: 110,
    config: { routes: ['/admin/packages'], apiPrefixes: ['/service-packages'] },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  },
  {
    id: 'plugin-marketing-pages',
    key: 'marketing_pages',
    name: 'Marketing Pages',
    description: 'Public-facing landing pages plus admin CMS for homepage, about, solutions, contact and pricing.',
    category: 'public',
    version: '1.0.0',
    installed: true,
    enabled: true,
    editable: true,
    isCore: false,
    routePath: '/admin/cms',
    areas: ['public', 'admin'],
    sortOrder: 140,
    config: { routes: ['/', '/about', '/solutions', '/pricing', '/contact', '/admin/cms'], apiPrefixes: ['/marketing-pages'] },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  },
  {
    id: 'plugin-contact-inquiries',
    key: 'contact_inquiries',
    name: 'Contact Inquiries',
    description: 'Public consultation form and admin lead handling workflow.',
    category: 'public',
    version: '1.0.0',
    installed: true,
    enabled: true,
    editable: true,
    isCore: false,
    routePath: '/admin/leads',
    areas: ['public', 'admin'],
    sortOrder: 143,
    config: { routes: ['/contact', '/admin/leads'], apiPrefixes: ['/contact-inquiries'] },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  },
  {
    id: 'plugin-website-ai-chat',
    key: 'website_ai_chat',
    name: 'Website AI Chat',
    description: 'Floating website assistant with guarded public chat for pricing, FAQs and conversion support.',
    category: 'public',
    version: '1.0.0',
    installed: true,
    enabled: true,
    editable: true,
    isCore: false,
    routePath: '/',
    areas: ['public', 'admin'],
    sortOrder: 144,
    config: { routes: ['/'], apiPrefixes: ['/ai/public-chat'] },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  },
  {
    id: 'plugin-content-posts',
    key: 'content_posts',
    name: 'Content Posts',
    description: 'Staff-managed articles, case studies and public news pages.',
    category: 'public',
    version: '1.0.0',
    installed: true,
    enabled: true,
    editable: true,
    isCore: false,
    routePath: '/admin/posts',
    areas: ['admin', 'public'],
    sortOrder: 145,
    config: { routes: ['/news', '/news/[slug]', '/admin/posts'], apiPrefixes: ['/content-posts'] },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  },
  {
    id: 'plugin-customer-profile',
    key: 'customer_profile',
    name: 'Customer Profile',
    description: 'Profile, site address and account-level preferences in the customer portal.',
    category: 'customer',
    version: '1.0.0',
    installed: true,
    enabled: true,
    editable: true,
    isCore: false,
    routePath: '/customer/profile',
    areas: ['customer'],
    sortOrder: 130,
    config: { routes: ['/customer/profile'], apiPrefixes: ['/customers/me/profile'] },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  },
];

const demoCustomerDashboard: CustomerDashboardData = {
  summary: {
    solarGenerated: 6572.3,
    loadConsumed: 1610,
    gridImported: 540,
    gridExported: 118,
    savings: 3280000,
    outstanding: 1260000,
    invoiceCount: customerInvoices.length,
    paymentStatus: 'ISSUED',
    liveSystems: 0,
    currentPvKw: null,
    averageBatterySoc: null,
    hasRealtimeData: false,
    hasDailyData: false,
    hasMonthlyData: true,
    currentBillingAmount: 1260000,
    currentBillingLabel: 'Can thanh toan',
    currentBillingPeriod: '03/2026',
    currentBillingStatus: 'OPEN',
    currentBillingVatRate: 8,
    outstandingInvoiceCount: 1,
    nearestDueInvoiceNumber: 'INV-202603-001',
    nearestDueInvoiceDate: new Date(2026, 2, 25).toISOString(),
    latestDataPeriod: '03/2026',
    latestDataSourceLabel: 'Nhap tay',
    latestDataStatusLabel: 'Da cap nhat',
    latestMeterReading: 12540,
    latestUpdatedAt: new Date().toISOString(),
    systemsTracked: 1,
    systemsUpdatedCurrentMonth: 1,
  },
  generationTrend: customerEnergyTrend,
  systems: customerSystems.map((system) => ({
    id: system.id,
    name: system.name,
    systemCode: system.id,
    capacityKwp: Number(system.capacity.replace(' kWp', '')),
    panelCount: 24,
    inverterBrand: system.inverter.split(' ')[0],
    inverterModel: system.inverter,
    monitoringProvider: 'SEMS_PORTAL',
    monitoringPlantId: 'demo-plant',
    latestMonitorAt: new Date().toISOString(),
    latestMonitorSnapshot: {
      provider: 'SEMS_PORTAL',
      plantId: 'demo-plant',
      plantName: system.name,
      currentPvKw: 6.2,
      batterySocPct: 68,
      todayGeneratedKwh: 31.8,
      totalGeneratedKwh: 6572.3,
      todayLoadConsumedKwh: 42.1,
      todayGridImportedKwh: 8.4,
      todayGridExportedKwh: 4.1,
      inverterSerial: 'SEMS-DEMO-001',
      inverterStatus: 'Online',
      fetchedAt: new Date().toISOString(),
    },
    location: system.location,
    uptime30dPct: 99.2,
    latestAlert: null,
    status: system.status.toUpperCase(),
  })),
  liveSnapshots: [
    {
      provider: 'SEMS_PORTAL',
      plantId: 'demo-plant',
      plantName: 'Cafe Nang Xanh Rooftop',
      currentPvKw: 6.2,
      batterySocPct: 68,
      todayGeneratedKwh: 31.8,
      totalGeneratedKwh: 6572.3,
      todayLoadConsumedKwh: 42.1,
      todayGridImportedKwh: 8.4,
      todayGridExportedKwh: 4.1,
      inverterSerial: 'SEMS-DEMO-001',
      inverterStatus: 'Online',
      fetchedAt: new Date().toISOString(),
    },
  ],
  meterHistory: [
    {
      year: 2026,
      month: 3,
      period: '03/2026',
      previousReading: 10930,
      currentReading: 12540,
      loadConsumedKwh: 1610,
      pvGenerationKwh: 1240,
      amount: 1260000,
      unpaidAmount: 1260000,
      paymentStatus: 'ISSUED',
      updatedAt: new Date().toISOString(),
      source: 'MANUAL',
      sourceLabel: 'Nhap tay',
      systemsCount: 1,
    },
    {
      year: 2026,
      month: 2,
      period: '02/2026',
      previousReading: 9790,
      currentReading: 10930,
      loadConsumedKwh: 1140,
      pvGenerationKwh: 1180,
      amount: 1140000,
      unpaidAmount: 0,
      paymentStatus: 'PAID',
      updatedAt: new Date(2026, 1, 28).toISOString(),
      source: 'MANUAL',
      sourceLabel: 'Nhap tay',
      systemsCount: 1,
    },
  ],
  syncStatus: {
    latestUpdatedAt: new Date().toISOString(),
    sourceLabel: 'Nhap tay',
    statusLabel: 'Da cap nhat',
    statusCode: 'READY',
  },
  contracts: customerContracts,
  invoices: customerInvoices,
  tickets: customerTickets,
};

const demoAdminSystems: AdminSystemRecord[] = adminSystems.map((system, index) => ({
  id: `demo-system-${index + 1}`,
  systemCode: system.id,
  name: system.name,
  systemType: index < 2 ? 'Áp mái' : 'Hybrid lưu trữ',
  capacityKwp: Number(system.capacity.replace(' kWp', '')),
  panelCount: 24 + index * 8,
  panelBrand: index < 2 ? 'Jinko Solar' : 'Longi',
  panelModel: index < 2 ? 'Tiger Neo' : 'Hi-MO 6',
  inverterBrand: system.inverter.split(' ')[0],
  inverterModel: system.inverter,
  monitoringProvider: index === 0 ? 'SEMS_PORTAL' : null,
  monitoringPlantId: index === 0 ? 'demo-plant' : null,
  latestMonitorAt: index === 0 ? new Date().toISOString() : null,
  latestMonitorSnapshot:
    index === 0
      ? ({
          provider: 'SEMS_PORTAL',
          plantId: 'demo-plant',
          plantName: system.name,
          currentPvKw: 6.2,
          batterySocPct: 68,
          todayGeneratedKwh: 31.8,
          totalGeneratedKwh: 6572.3,
          todayGridImportedKwh: 8.4,
          todayGridExportedKwh: 4.1,
          inverterSerial: 'SEMS-DEMO-001',
          inverterStatus: 'Online',
          fetchedAt: new Date().toISOString(),
        } satisfies MonitorSnapshot)
        : null,
    location: system.location,
    installDate: new Date(2025, index, 15).toISOString(),
    notes: index === 2 ? 'Theo dõi cảnh báo điện áp inverter vào buổi trưa.' : 'Hệ thống vận hành ổn định theo lịch bảo trì định kỳ.',
    metadata: null,
    status: system.status.toUpperCase(),
    createdAt: new Date(2025, index, 15).toISOString(),
    updatedAt: new Date().toISOString(),
    customer: {
      id: `demo-customer-${index + 1}`,
      companyName: index === 0 ? 'Cafe Nang Xanh' : 'Demo Customer',
      user: {
        id: `demo-customer-user-${index + 1}`,
        fullName: index === 0 ? 'Nguyen Van A' : 'Moka Admin Demo',
        email: index === 0 ? 'customer@example.com' : 'admin@example.com',
      },
    },
  }));

const demoContentPosts: ContentPost[] = [
  {
    id: 'post-1',
    title: '5 sai lầm phổ biến khi doanh nghiệp đầu tư điện mặt trời mái nhà',
    slug: '5-sai-lam-khi-doanh-nghiep-dau-tu-dien-mat-troi-mai-nha',
    excerpt:
      'Checklist ngắn cho SME tại Việt Nam để tránh đội vốn, sai mô hình hợp đồng và vận hành thiếu dữ liệu.',
    content:
      'Nhiều doanh nghiệp bắt đầu từ báo giá thiết bị mà chưa khóa rõ bài toán tiền điện, mô hình hợp đồng và trách nhiệm vận hành.\n\nBước đúng là xác định phụ tải, khung giờ tiêu thụ và mức chấp nhận đầu tư ban đầu.\n\nVới mô hình PPA, lease hoặc hybrid, việc đo đếm dữ liệu hàng ngày và đối soát hóa đơn theo từng kỳ là điều bắt buộc.',
    coverImageUrl:
      'https://images.unsplash.com/photo-1509391366360-2e959784a276?auto=format&fit=crop&w=1600&q=80',
    tags: ['solar-rooftop', 'commercial', 'billing'],
    status: 'PUBLISHED',
    isFeatured: true,
    publishedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    author: {
      fullName: 'Moka Operations Admin',
      email: 'admin@example.com',
      role: { code: 'ADMIN', name: 'Admin' },
    },
  },
  {
    id: 'post-2',
    title: 'So sánh PPA, thuê hệ thống và trả góp cho thị trường Việt Nam',
    slug: 'so-sanh-ppa-thue-he-thong-va-tra-gop-cho-thi-truong-viet-nam',
    excerpt:
      'Mỗi mô hình phù hợp với một kiểu dòng tiền khác nhau. Bài viết này giúp đội sales và khách hàng chốt nhanh hơn.',
    content:
      'PPA phù hợp khi khách hàng muốn giảm chi phí ngay mà không bỏ capex lớn.\n\nThuê hệ thống phù hợp cho khách muốn hóa đơn ổn định theo tháng.\n\nTrả góp phù hợp khi khách hàng muốn sở hữu tài sản trong trung hạn.',
    coverImageUrl:
      'https://images.unsplash.com/photo-1497436072909-60f360e1d4b1?auto=format&fit=crop&w=1600&q=80',
    tags: ['ppa', 'lease', 'installment'],
    status: 'PUBLISHED',
    isFeatured: true,
    publishedAt: new Date(Date.now() - 86400000).toISOString(),
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 86400000).toISOString(),
    author: {
      fullName: 'Moka Super Admin',
      email: 'superadmin@example.com',
      role: { code: 'SUPER_ADMIN', name: 'Super Admin' },
    },
  },
];

const demoContactInquiries: ContactInquiryRecord[] = [
  {
    id: 'lead-1',
    fullName: 'Tran Minh Solar',
    email: 'lead1@example.com',
    phone: '0988000111',
    companyName: 'Minh Solar Coffee',
    siteCount: '3 sites',
    message:
      'We are operating three cafes and want a PPA-style offer with monthly billing and a clean customer portal.',
    sourcePage: 'contact',
    status: 'NEW',
    internalNote: null,
    createdAt: new Date(Date.now() - 1000 * 60 * 40).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 40).toISOString(),
    handledBy: null,
  },
  {
    id: 'lead-2',
    fullName: 'Nguyen Hoang Logistics',
    email: 'lead2@example.com',
    phone: '0977000222',
    companyName: 'Hoang Logistics',
    siteCount: '1 warehouse',
    message:
      'Need a hybrid proposal for a warehouse roof and want to understand the collection workflow for monthly invoices.',
    sourcePage: 'contact',
    status: 'CONTACTED',
    internalNote: 'Qualified by ops team. Waiting for site survey slot.',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    handledBy: {
      id: 'demo-admin',
      fullName: 'Moka Operations Admin',
      email: 'admin@example.com',
      role: { code: 'ADMIN', name: 'Admin' },
    },
  },
];

const demoAdminDashboard: AdminDashboardData = {
  summary: {
    totalCustomers: Number(adminSummary[0].value),
    totalCapacityKwp: 843.5,
    monthlyRevenue: 428500000,
    yearlyRevenue: 2520000000,
    unpaidInvoices: 17,
    overdueInvoices: 3,
    openTickets: 6,
    onTimeRate: 92.4,
  },
  revenueTrend: adminRevenueTrend,
  energyTrend: adminEnergyTrend,
  topCustomers: adminCustomers.slice(0, 4).map((customer, index) => ({
    customerId: customer.id,
    companyName: customer.name,
    totalBilled: customer.mrr * (index + 3),
    unpaidBalance: index === 0 ? customer.mrr : 0,
  })),
  ticketSummary: {
    open: 2,
    inProgress: 2,
    resolved: 4,
  },
};

function buildDemoCustomerRecords(): CustomerRecord[] {
  return adminCustomers.map((customer) => ({
    id: customer.id,
    customerCode: customer.id,
    companyName: customer.name,
    installationAddress: customer.site,
    billingAddress: customer.site,
    notes: 'Khách hàng demo trong danh mục vận hành.',
    status: 'ACTIVE' as CustomerStatus,
    createdAt: new Date(2025, 0, 1).toISOString(),
    updatedAt: new Date().toISOString(),
    user: {
      id: `${customer.id}-user`,
      fullName: customer.name,
      email: customer.email,
      phone: '',
      role: { code: 'CUSTOMER' as UserRole, name: 'Customer' },
    },
    ownerUser: {
      id: 'demo-admin',
      fullName: 'Moka Operations Admin',
      email: 'admin@example.com',
      role: { code: 'ADMIN', name: 'Admin' },
    },
    solarSystems: [
      {
        id: `${customer.id}-system`,
        systemCode: `${customer.id}-system`,
        name: customer.system,
        capacityKwp: Number(customer.system.replace(' kWp', '')) || 0,
        status: customer.status,
      },
    ],
    invoices: [
      {
        id: `${customer.id}-invoice`,
        invoiceNumber: `${customer.id}-invoice`,
        totalAmount: customer.mrr,
        status: customer.status,
      },
    ],
  }));
}

let demoCustomerRecords = buildDemoCustomerRecords();
let demoSystemRecords = [...demoAdminSystems];
const demoUsers: UserRecord[] = [
  {
    id: 'demo-super-admin',
    email: 'superadmin@example.com',
    fullName: 'Moka Super Admin',
    phone: '0900000001',
    createdAt: new Date(2025, 0, 1).toISOString(),
    updatedAt: new Date().toISOString(),
    role: { code: 'SUPER_ADMIN', name: 'Super Admin' },
  },
  {
    id: 'demo-admin',
    email: 'admin@example.com',
    fullName: 'Moka Operations Admin',
    phone: '0900000002',
    createdAt: new Date(2025, 0, 1).toISOString(),
    updatedAt: new Date().toISOString(),
    role: { code: 'ADMIN', name: 'Admin' },
  },
  {
    id: 'demo-staff',
    email: 'staff@example.com',
    fullName: 'Moka Field Staff',
    phone: '0900000003',
    createdAt: new Date(2025, 0, 2).toISOString(),
    updatedAt: new Date().toISOString(),
    role: { code: 'STAFF', name: 'Staff' },
  },
];
let demoMediaAssets: MediaAssetRecord[] = [];
let demoMonthlyPvBillings: MonthlyPvBillingRecord[] = [];
let demoSolarmanConnections: SolarmanConnectionRecord[] = [];

export async function featureCatalogRequest() {
  try {
    return await apiFetch<FeaturePlugin[]>('/feature-plugins/catalog');
  } catch (error) {
    return fallbackOrThrow(error, () =>
      demoFeaturePlugins.filter((plugin) => plugin.installed && plugin.enabled),
    );
  }
}

export async function listFeaturePluginsRequest() {
  try {
    return await apiFetch<FeaturePlugin[]>('/feature-plugins');
  } catch (error) {
    return fallbackOrThrow(error, () => demoFeaturePlugins);
  }
}

export async function updateFeaturePluginRequest(id: string, payload: Partial<FeaturePlugin>) {
  try {
    return await apiFetch<FeaturePlugin>(`/feature-plugins/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  } catch (error) {
    return fallbackOrThrow(error, () => ({
      ...(demoFeaturePlugins.find((plugin) => plugin.id === id) || demoFeaturePlugins[0]),
      ...payload,
      updatedAt: new Date().toISOString(),
    } as FeaturePlugin));
  }
}

export async function syncFeaturePluginsRequest() {
  try {
    return await apiFetch<FeaturePlugin[]>('/feature-plugins/sync-defaults', {
      method: 'POST',
    });
  } catch (error) {
    return fallbackOrThrow(error, () => demoFeaturePlugins);
  }
}

export async function customerDashboardRequest() {
  try {
    return await apiFetch<CustomerDashboardData>('/reports/customer-dashboard');
  } catch (error) {
    return fallbackOrThrow(error, () => demoCustomerDashboard);
  }
}

export async function myCustomerProfileRequest() {
  try {
    return await apiFetch<CustomerRecord>('/customers/me/profile');
  } catch (error) {
    return fallbackOrThrow(error, () => {
      const fallback: CustomerRecord = {
        id: 'demo-customer-001',
        customerCode: 'CUS-DEMO-001',
        companyName: customerProfile.companyName,
        installationAddress: customerProfile.installationAddress,
        billingAddress: customerProfile.billingAddress,
        notes: null,
        defaultUnitPrice: null,
        defaultVatRate: null,
        defaultTaxAmount: null,
        defaultDiscountAmount: null,
        status: 'ACTIVE' as CustomerStatus,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        user: {
          id: 'demo-customer-user',
          fullName: customerProfile.accountName,
          email: customerProfile.email,
          phone: customerProfile.phone,
          role: {
            code: 'CUSTOMER',
            name: 'Customer',
          },
        },
        ownerUser: null,
        solarSystems: customerSystems.map((system) => ({
          id: system.id,
          systemCode: system.id,
          name: system.name,
          capacityKwp: Number(system.capacity.replace(/[^0-9.]/g, '')) || 0,
          status: system.status.toUpperCase(),
          stationId: null,
          stationName: null,
          monitoringProvider: null,
          location: system.location,
          locationAddress: system.location,
        })),
        contracts: [],
        invoices: [],
      };

      return fallback;
    });
  }
}

export async function listMyNotificationsRequest(limit?: number) {
  try {
    const query = limit ? `?limit=${encodeURIComponent(String(limit))}` : '';
    return await apiFetch<NotificationRecord[]>(`/notifications/me${query}`);
  } catch (error) {
    return fallbackOrThrow(error, () =>
      customerNotifications.map((item) => ({
        id: item.id,
        title: item.title,
        body: item.body,
        type: 'GENERAL',
        isRead: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })),
    );
  }
}

export async function notificationsUnreadSummaryRequest() {
  try {
    return await apiFetch<NotificationUnreadSummary>('/notifications/unread-summary');
  } catch (error) {
    return fallbackOrThrow(error, () => ({
      unreadCount: customerNotifications.length,
    }));
  }
}

export async function markNotificationReadRequest(id: string) {
  return apiFetch<NotificationRecord>(`/notifications/${id}/read`, {
    method: 'PATCH',
  });
}

export async function markAllNotificationsReadRequest() {
  return apiFetch<NotificationUnreadSummary>('/notifications/read-all', {
    method: 'PATCH',
  });
}

export async function listAdminSystemsRequest() {
  try {
    return await apiFetch<AdminSystemRecord[]>('/systems');
  } catch (error) {
    return fallbackOrThrow(error, () => demoSystemRecords);
  }
}

export async function createSystemRequest(payload: {
  customerId: string;
  systemCode?: string;
  name: string;
  systemType?: string;
  capacityKwp: number;
  panelCount: number;
  panelBrand?: string;
  panelModel?: string;
  inverterBrand?: string;
  inverterModel?: string;
  monitoringProvider?: string;
  monitoringPlantId?: string;
  stationId?: string;
  stationName?: string;
  sourceSystem?: string;
  defaultUnitPrice?: number;
  defaultVatRate?: number;
  defaultTaxAmount?: number;
  defaultDiscountAmount?: number;
  installDate?: string;
  location?: string;
  notes?: string;
  status?: string;
}) {
  try {
    return await apiFetch<AdminSystemRecord>('/systems', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  } catch (error) {
    return fallbackOrThrow(error, () => {
      const customer = demoCustomerRecords.find((item) => item.id === payload.customerId);
      const created: AdminSystemRecord = {
        id: `system-${Date.now()}`,
        systemCode: payload.systemCode || `SYS-${Date.now()}`,
        name: payload.name,
        systemType: payload.systemType || null,
        capacityKwp: payload.capacityKwp,
        panelCount: payload.panelCount,
        panelBrand: payload.panelBrand || null,
        panelModel: payload.panelModel || null,
        inverterBrand: payload.inverterBrand || null,
        inverterModel: payload.inverterModel || null,
        monitoringProvider: payload.monitoringProvider || null,
        monitoringPlantId: payload.monitoringPlantId || null,
        stationId: payload.stationId || null,
        stationName: payload.stationName || null,
        sourceSystem: payload.sourceSystem || null,
        defaultUnitPrice: payload.defaultUnitPrice || null,
        defaultVatRate: payload.defaultVatRate || null,
        defaultTaxAmount: payload.defaultTaxAmount || null,
        defaultDiscountAmount: payload.defaultDiscountAmount || null,
        latestMonitorSnapshot: null,
        latestMonitorAt: null,
        installDate: payload.installDate || null,
        location: payload.location || null,
        notes: payload.notes || null,
        metadata: null,
        status: payload.status || 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        customer: customer
          ? {
              id: customer.id,
              companyName: customer.companyName,
              user: {
                id: customer.user.id,
                fullName: customer.user.fullName,
                email: customer.user.email,
              },
            }
          : null,
      };

      demoSystemRecords = [created, ...demoSystemRecords];
      return created;
    });
  }
}

export async function updateSystemRequest(
  id: string,
  payload: {
    customerId?: string;
    systemCode?: string;
    name?: string;
    systemType?: string;
    capacityKwp?: number;
    panelCount?: number;
    panelBrand?: string;
    panelModel?: string;
    inverterBrand?: string;
    inverterModel?: string;
    monitoringProvider?: string;
    monitoringPlantId?: string;
    stationId?: string;
    stationName?: string;
    sourceSystem?: string;
    defaultUnitPrice?: number;
    defaultVatRate?: number;
    defaultTaxAmount?: number;
    defaultDiscountAmount?: number;
    installDate?: string;
    location?: string;
    notes?: string;
    status?: string;
  },
) {
  try {
    return await apiFetch<AdminSystemRecord>(`/systems/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  } catch (error) {
    return fallbackOrThrow(error, () => {
      const current = demoSystemRecords.find((system) => system.id === id);
      if (!current) {
        throw new Error('System not found');
      }

      const customer = payload.customerId
        ? demoCustomerRecords.find((item) => item.id === payload.customerId)
        : null;

      const updated: AdminSystemRecord = {
        ...current,
        ...payload,
        installedCapacityKwp:
          payload.capacityKwp !== undefined ? payload.capacityKwp : current.installedCapacityKwp,
        customer: customer
          ? {
              id: customer.id,
              companyName: customer.companyName,
              user: {
                id: customer.user.id,
                fullName: customer.user.fullName,
                email: customer.user.email,
              },
            }
          : current.customer,
        updatedAt: new Date().toISOString(),
      };

      demoSystemRecords = demoSystemRecords.map((system) => (system.id === id ? updated : system));
      return updated;
    });
  }
}

export async function deleteSystemRequest(id: string) {
  try {
    return await apiFetch<{ success: boolean }>(`/systems/${id}`, {
      method: 'DELETE',
    });
  } catch (error) {
    return fallbackOrThrow(error, () => {
      demoSystemRecords = demoSystemRecords.filter((item) => item.id !== id);
      return { success: true };
    });
  }
}

export async function listSolarmanConnectionsRequest() {
  try {
    return await apiFetch<SolarmanConnectionRecord[]>('/solarman-connections');
  } catch (error) {
    return fallbackOrThrow(error, () => demoSolarmanConnections);
  }
}

export async function getSolarmanConnectionRequest(id: string) {
  try {
    return await apiFetch<SolarmanConnectionRecord>(`/solarman-connections/${id}`);
  } catch (error) {
    return fallbackOrThrow(error, () => {
      const found = demoSolarmanConnections.find((item) => item.id === id);
      if (!found) {
        throw new Error('SOLARMAN connection not found');
      }

      return found;
    });
  }
}

export async function listSolarmanSyncLogsRequest(id: string) {
  try {
    return await apiFetch<SolarmanSyncLogRecord[]>(`/solarman-connections/${id}/logs`);
  } catch (error) {
    return fallbackOrThrow(error, () => {
      const found = demoSolarmanConnections.find((item) => item.id === id);
      return found?.syncLogs || [];
    });
  }
}

export async function createSolarmanConnectionRequest(payload: {
  accountName: string;
  usernameOrEmail: string;
  password: string;
  customerId?: string;
  defaultUnitPrice?: number;
  defaultVatRate?: number;
  defaultTaxAmount?: number;
  defaultDiscountAmount?: number;
  status?: string;
  notes?: string;
}) {
  try {
    return await apiFetch<SolarmanConnectionRecord>('/solarman-connections', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  } catch (error) {
    return fallbackOrThrow(error, () => {
      const customer = payload.customerId
        ? demoCustomerRecords.find((item) => item.id === payload.customerId) || null
        : null;
      const created: SolarmanConnectionRecord = {
        id: `solarman-${Date.now()}`,
        accountName: payload.accountName,
        usernameOrEmail: payload.usernameOrEmail,
        customerId: payload.customerId || null,
        defaultUnitPrice: payload.defaultUnitPrice || null,
        defaultVatRate: payload.defaultVatRate || null,
        defaultTaxAmount: payload.defaultTaxAmount || null,
        defaultDiscountAmount: payload.defaultDiscountAmount || null,
        status: payload.status || 'ACTIVE',
        lastSyncTime: null,
        notes: payload.notes || null,
        accessTokenPreview: null,
        hasStoredPassword: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
        customer,
        systems: [],
        syncLogs: [],
      };
      demoSolarmanConnections = [created, ...demoSolarmanConnections];
      return created;
    });
  }
}

export async function updateSolarmanConnectionRequest(
  id: string,
  payload: {
    accountName?: string;
    usernameOrEmail?: string;
    password?: string;
    customerId?: string;
    defaultUnitPrice?: number;
    defaultVatRate?: number;
    defaultTaxAmount?: number;
    defaultDiscountAmount?: number;
    status?: string;
    notes?: string;
  },
) {
  try {
    return await apiFetch<SolarmanConnectionRecord>(`/solarman-connections/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  } catch (error) {
    return fallbackOrThrow(error, () => {
      const current = demoSolarmanConnections.find((item) => item.id === id);
      if (!current) {
        throw new Error('SOLARMAN connection not found');
      }

      const customer =
        payload.customerId === undefined
          ? current.customer || null
          : payload.customerId
            ? demoCustomerRecords.find((item) => item.id === payload.customerId) || null
            : null;

      const updated: SolarmanConnectionRecord = {
        ...current,
        ...payload,
        customerId:
          payload.customerId === undefined ? current.customerId : payload.customerId || null,
        customer,
        hasStoredPassword: payload.password ? true : current.hasStoredPassword,
        updatedAt: new Date().toISOString(),
      };

      demoSolarmanConnections = demoSolarmanConnections.map((item) =>
        item.id === id ? updated : item,
      );
      return updated;
    });
  }
}

export async function deleteSolarmanConnectionRequest(id: string) {
  try {
    return await apiFetch<{ success: boolean }>(`/solarman-connections/${id}`, {
      method: 'DELETE',
    });
  } catch (error) {
    return fallbackOrThrow(error, () => {
      demoSolarmanConnections = demoSolarmanConnections.filter((item) => item.id !== id);
      return { success: true };
    });
  }
}

export async function testSolarmanConnectionRequest(id: string) {
  try {
    return await apiFetch<SolarmanTestResponse>(`/solarman-connections/${id}/test`, {
      method: 'POST',
    });
  } catch (error) {
    return fallbackOrThrow(error, () => {
      const connection = demoSolarmanConnections.find((item) => item.id === id);
      if (!connection) {
        throw new Error('SOLARMAN connection not found');
      }

      return {
        connection: {
          ...connection,
          accessTokenPreview: 'demo-token...',
          updatedAt: new Date().toISOString(),
        },
        stations: [],
      };
    });
  }
}

export async function syncSolarmanConnectionRequest(
  id: string,
  payload: {
    year?: number;
    stationIds?: string[];
    createMissingSystems?: boolean;
  },
) {
  try {
    return await apiFetch<SolarmanSyncResponse>(`/solarman-connections/${id}/sync`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  } catch (error) {
    return fallbackOrThrow(error, () => {
      const connection = demoSolarmanConnections.find((item) => item.id === id);
      if (!connection) {
        throw new Error('SOLARMAN connection not found');
      }

      return {
        connection: {
          ...connection,
          lastSyncTime: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        syncedStations: 0,
        syncedMonths: 0,
        syncedBillings: 0,
        stations: [],
      };
    });
  }
}

export function buildApiUrl(path: string) {
  return `${getApiBaseUrl()}${path}`;
}

export async function listLuxPowerConnectionsRequest() {
  return apiFetch<LuxPowerConnectionRecord[]>('/luxpower-connections');
}

export async function getLuxPowerConnectionRequest(id: string) {
  return apiFetch<LuxPowerConnectionRecord>(`/luxpower-connections/${id}`);
}

export async function listLuxPowerSyncLogsRequest(id: string) {
  return apiFetch<LuxPowerSyncLogRecord[]>(`/luxpower-connections/${id}/logs`);
}

export async function createLuxPowerConnectionRequest(payload: {
  accountName: string;
  username?: string;
  password?: string;
  plantId?: string;
  inverterSerial?: string;
  customerId?: string;
  solarSystemId?: string;
  contractId?: string;
  billingRuleLabel?: string;
  pollingIntervalMinutes?: number;
  useDemoMode?: boolean;
  status?: string;
  notes?: string;
}) {
  return apiFetch<LuxPowerConnectionRecord>('/luxpower-connections', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateLuxPowerConnectionRequest(
  id: string,
  payload: {
    accountName?: string;
    username?: string;
    password?: string;
    plantId?: string;
    inverterSerial?: string;
    customerId?: string;
    solarSystemId?: string;
    contractId?: string;
    billingRuleLabel?: string;
    pollingIntervalMinutes?: number;
    useDemoMode?: boolean;
    status?: string;
    notes?: string;
  },
) {
  return apiFetch<LuxPowerConnectionRecord>(`/luxpower-connections/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteLuxPowerConnectionRequest(id: string) {
  return apiFetch<{ success: boolean }>(`/luxpower-connections/${id}`, {
    method: 'DELETE',
  });
}

export async function testLuxPowerConnectionRequest(id: string) {
  return apiFetch<LuxPowerTestResponse>(`/luxpower-connections/${id}/test`, {
    method: 'POST',
  });
}

export async function syncLuxPowerConnectionRequest(
  id: string,
  payload?: {
    forceRelogin?: boolean;
  },
) {
  return apiFetch<LuxPowerSyncResponse>(`/luxpower-connections/${id}/sync`, {
    method: 'POST',
    body: JSON.stringify(payload || {}),
  });
}

export async function previewLuxPowerSystemRequest(
  systemId: string,
  payload: {
    connectionId: string;
    plantId?: string;
    inverterSerial?: string;
  },
) {
  return apiFetch<LuxPowerSystemPreviewResponse>(`/systems/${systemId}/luxpower-preview`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function syncLuxPowerSystemRequest(
  systemId: string,
  payload: {
    connectionId: string;
    plantId?: string;
    inverterSerial?: string;
    forceRelogin?: boolean;
  },
) {
  return apiFetch<LuxPowerSystemSyncResponse>(`/systems/${systemId}/luxpower-sync`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function listDeyeConnectionsRequest() {
  return apiFetch<DeyeConnectionRecord[]>('/deye-connections');
}

export async function getDeyeConnectionRequest(id: string) {
  return apiFetch<DeyeConnectionRecord>(`/deye-connections/${id}`);
}

export async function listDeyeSyncLogsRequest(id: string) {
  return apiFetch<DeyeSyncLogRecord[]>(`/deye-connections/${id}/logs`);
}

export async function createDeyeConnectionRequest(payload: {
  accountName: string;
  appId: string;
  appSecret: string;
  email: string;
  password: string;
  baseUrl: string;
  status?: string;
}) {
  return apiFetch<DeyeConnectionRecord>('/deye-connections', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateDeyeConnectionRequest(
  id: string,
  payload: {
    accountName?: string;
    appId?: string;
    appSecret?: string;
    email?: string;
    password?: string;
    baseUrl?: string;
    status?: string;
  },
) {
  return apiFetch<DeyeConnectionRecord>(`/deye-connections/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteDeyeConnectionRequest(id: string) {
  return apiFetch<{ success: boolean }>(`/deye-connections/${id}`, {
    method: 'DELETE',
  });
}

export async function testDeyeConnectionRequest(id: string) {
  return apiFetch<{
    connection: DeyeConnectionRecord;
    accountInfo: Record<string, unknown>;
  }>(`/deye-connections/${id}/test`, {
    method: 'POST',
  });
}

export async function syncDeyeStationsRequest(id: string) {
  return apiFetch<{
    connection: DeyeConnectionRecord;
    stations: Array<Record<string, unknown>>;
    syncedStations: Array<Record<string, unknown>>;
  }>(`/deye-connections/${id}/sync-stations`, {
    method: 'POST',
  });
}

export async function syncDeyeMonthlyHistoryRequest(
  id: string,
  payload: {
    year?: number;
    startAt?: string;
    endAt?: string;
    stationIds?: string[];
    includeStationSync?: boolean;
  },
) {
  return apiFetch<{
    connection: DeyeConnectionRecord;
    year: number;
    startAt: string;
    endAt: string;
    syncedMonths: number;
    syncedBillings: number;
    stations: Array<Record<string, unknown>>;
  }>(`/deye-connections/${id}/sync-monthly-history`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function syncDeyeConnectionRequest(
  id: string,
  payload: {
    year?: number;
    startAt?: string;
    endAt?: string;
    stationIds?: string[];
    includeStationSync?: boolean;
  },
) {
  return apiFetch<{
    connection: DeyeConnectionRecord;
    year: number;
    startAt: string;
    endAt: string;
    syncedMonths: number;
    syncedBillings: number;
    syncedRealtimeRecords?: number;
    syncedDailyRecords?: number;
    stations: Array<Record<string, unknown>>;
    stationSync?: Record<string, unknown>;
    monitoringSync?: Record<string, unknown>;
    monthlySync?: Record<string, unknown>;
  }>(`/deye-connections/${id}/sync`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function previewDeyeSystemStationsRequest(
  systemId: string,
  payload: {
    connectionId: string;
  },
) {
  return apiFetch<DeyeSystemPreviewResponse>(`/systems/${systemId}/deye-preview`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function syncDeyeSystemStationRequest(
  systemId: string,
  payload: {
    connectionId: string;
    stationId: string;
  },
) {
  return apiFetch<{
    systemId: string;
    systemCode: string;
    stationId: string;
    stationName?: string | null;
    syncedDevices: number;
    system: AdminSystemRecord;
  }>(`/systems/${systemId}/deye-sync`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function previewSemsRequest(payload: {
  plantId: string;
  account?: string;
  password?: string;
  loginUrl?: string;
}) {
  return apiFetch<MonitorSnapshot>('/energy-records/sems-preview', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function previewSolarmanRequest(payload: {
  stationId: string;
  baseUrl?: string;
  appId?: string;
  appSecret?: string;
  username?: string;
  password?: string;
  startDate?: string;
  endDate?: string;
  timeType?: number;
}) {
  return apiFetch<MonitorSnapshot>('/energy-records/solarman-preview', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function syncSemsRequest(
  systemId: string,
  payload: {
    plantId: string;
    account?: string;
    password?: string;
    loginUrl?: string;
  },
) {
  return apiFetch<{
    systemId: string;
    systemCode: string;
    provider: string;
    snapshot: MonitorSnapshot;
    record: Record<string, unknown>;
    derivedMetrics: Record<string, boolean>;
  }>(`/energy-records/sems-sync/${systemId}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function syncSolarmanRequest(
  systemId: string,
  payload: {
    stationId: string;
    baseUrl?: string;
    appId?: string;
    appSecret?: string;
    username?: string;
    password?: string;
    startDate?: string;
    endDate?: string;
    timeType?: number;
  },
) {
  return apiFetch<{
    systemId: string;
    systemCode: string;
    provider: string;
    snapshot: MonitorSnapshot;
    record: Record<string, unknown>;
    derivedMetrics: Record<string, boolean>;
  }>(`/energy-records/solarman-sync/${systemId}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function listMonthlyPvBillingsRequest(query?: {
  systemId?: string;
  customerId?: string;
  month?: number;
  year?: number;
}) {
  const searchParams = new URLSearchParams();

  if (query?.systemId) {
    searchParams.set('systemId', query.systemId);
  }

  if (query?.customerId) {
    searchParams.set('customerId', query.customerId);
  }

  if (query?.month) {
    searchParams.set('month', String(query.month));
  }

  if (query?.year) {
    searchParams.set('year', String(query.year));
  }

  const suffix = searchParams.toString() ? `?${searchParams.toString()}` : '';

  return apiFetch<MonthlyPvBillingRecord[]>(`/monthly-pv-billings${suffix}`);
}

export async function syncMonthlyPvBillingRequest(
  systemId: string,
  payload: {
    month: number;
    year: number;
    pvGenerationKwh?: number;
    unitPrice?: number;
    taxRate?: number;
    vatRate?: number;
    discountAmount?: number;
    source?: string;
    note?: string;
  },
) {
  return apiFetch<MonthlyPvBillingRecord>(`/monthly-pv-billings/sync/${systemId}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateMonthlyPvBillingRequest(
  id: string,
  payload: {
    month?: number;
    year?: number;
    pvGenerationKwh?: number;
    unitPrice?: number;
    taxRate?: number;
    vatRate?: number;
    discountAmount?: number;
    source?: string;
    note?: string;
  },
) {
  return apiFetch<MonthlyPvBillingRecord>(`/monthly-pv-billings/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteMonthlyPvBillingRequest(id: string) {
  return apiFetch<{ success: boolean }>(`/monthly-pv-billings/${id}`, {
    method: 'DELETE',
  });
}

export async function operationalOverviewRequest(query?: {
  customerId?: string;
  sourceKind?: string;
  systemStatus?: string;
  staleDays?: number;
}) {
  const searchParams = new URLSearchParams();

  if (query?.customerId) {
    searchParams.set('customerId', query.customerId);
  }

  if (query?.sourceKind) {
    searchParams.set('sourceKind', query.sourceKind);
  }

  if (query?.systemStatus) {
    searchParams.set('systemStatus', query.systemStatus);
  }

  if (query?.staleDays) {
    searchParams.set('staleDays', String(query.staleDays));
  }

  const suffix = searchParams.toString() ? `?${searchParams.toString()}` : '';
  return apiFetch<OperationalOverviewResponse>(`/operational-data/overview${suffix}`);
}

export async function listSystemOperationalRecordsRequest(systemId: string) {
  return apiFetch<SystemOperationalRecordsResponse>(`/operational-data/systems/${systemId}/records`);
}

export async function upsertSystemOperationalRecordRequest(
  systemId: string,
  payload: {
    month: number;
    year: number;
    pvGenerationKwh: number;
    loadConsumedKwh?: number;
    savingsAmount?: number;
    unitPrice?: number;
    vatRate?: number;
    discountAmount?: number;
    systemStatus?: string;
    note?: string;
    source?: string;
    dataSourceNote?: string;
  },
) {
  return apiFetch<{
    record: SystemOperationalRecordsResponse['records'][number];
    billing?: MonthlyPvBillingRecord | null;
  }>(`/operational-data/systems/${systemId}/records`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function importOperationalDataRequest(
  formData: FormData,
  options?: {
    source?: string;
    overwriteExisting?: boolean;
    syncBilling?: boolean;
  },
) {
  if (options?.source) {
    formData.append('source', options.source);
  }

  if (typeof options?.overwriteExisting === 'boolean') {
    formData.append('overwriteExisting', String(options.overwriteExisting));
  }

  if (typeof options?.syncBilling === 'boolean') {
    formData.append('syncBilling', String(options.syncBilling));
  }

  return apiFetch<ImportOperationalDataResponse>('/operational-data/import', {
    method: 'POST',
    body: formData,
  });
}

export async function generateMonthlyPvBillingInvoiceRequest(id: string) {
  return apiFetch<{
    record: MonthlyPvBillingRecord;
    invoice: InvoiceRecord;
  }>(`/monthly-pv-billings/${id}/generate-invoice`, {
    method: 'POST',
  });
}

export async function adminDashboardRequest() {
  try {
    return await apiFetch<AdminDashboardData>('/reports/admin-dashboard');
  } catch (error) {
    return fallbackOrThrow(error, () => demoAdminDashboard);
  }
}

export async function listCustomersRequest() {
  try {
    return await apiFetch<CustomerRecord[]>('/customers');
  } catch (error) {
    return fallbackOrThrow(error, () => demoCustomerRecords);
  }
}

export async function getCustomerRequest(id: string) {
  return apiFetch<CustomerRecord>(`/customers/${id}`);
}

export async function createCustomerRequest(payload: {
  fullName: string;
  email: string;
  password?: string;
  phone?: string;
  companyName?: string;
  installationAddress?: string;
  billingAddress?: string;
  notes?: string;
  defaultUnitPrice?: number;
  defaultVatRate?: number;
  defaultTaxAmount?: number;
  defaultDiscountAmount?: number;
  status?: CustomerStatus;
  ownerUserId?: string;
}) {
  try {
    return await apiFetch<CustomerRecord>('/customers', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  } catch (error) {
    return fallbackOrThrow(error, () => {
        const created: CustomerRecord = {
          id: `customer-${Date.now()}`,
          customerCode: `CUS-${Date.now()}`,
          companyName: payload.companyName || payload.fullName,
          installationAddress: payload.installationAddress || null,
          billingAddress: payload.billingAddress || null,
          notes: payload.notes || null,
          defaultUnitPrice: payload.defaultUnitPrice ?? null,
          defaultVatRate: payload.defaultVatRate ?? null,
          defaultTaxAmount: payload.defaultTaxAmount ?? null,
          defaultDiscountAmount: payload.defaultDiscountAmount ?? null,
          status: payload.status || 'ACTIVE',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          user: {
            id: `user-${Date.now()}`,
            fullName: payload.fullName,
            email: payload.email,
            phone: payload.phone || null,
            role: { code: 'CUSTOMER', name: 'Customer' },
          },
          ownerUser: payload.ownerUserId
            ? demoUsers.find((item) => item.id === payload.ownerUserId) || null
            : null,
          solarSystems: [],
          contracts: [],
          invoices: [],
        };

      demoCustomerRecords = [created, ...demoCustomerRecords];
      return created;
    });
  }
}

export async function updateCustomerRequest(
  id: string,
    payload: {
      fullName?: string;
      email?: string;
      password?: string;
      phone?: string;
      companyName?: string;
      installationAddress?: string;
      billingAddress?: string;
      notes?: string;
      defaultUnitPrice?: number;
      defaultVatRate?: number;
      defaultTaxAmount?: number;
      defaultDiscountAmount?: number;
      status?: CustomerStatus;
      ownerUserId?: string;
    },
  ) {
  try {
    return await apiFetch<CustomerRecord>(`/customers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  } catch (error) {
    return fallbackOrThrow(error, () => {
      const current = demoCustomerRecords.find((item) => item.id === id);
      if (!current) {
        throw new Error('Customer not found');
      }

        const updated: CustomerRecord = {
          ...current,
          companyName: payload.companyName ?? current.companyName,
          installationAddress: payload.installationAddress ?? current.installationAddress,
          billingAddress: payload.billingAddress ?? current.billingAddress,
          notes: payload.notes ?? current.notes,
          defaultUnitPrice: payload.defaultUnitPrice ?? current.defaultUnitPrice,
          defaultVatRate: payload.defaultVatRate ?? current.defaultVatRate,
          defaultTaxAmount: payload.defaultTaxAmount ?? current.defaultTaxAmount,
          defaultDiscountAmount:
            payload.defaultDiscountAmount ?? current.defaultDiscountAmount,
          status: payload.status ?? current.status,
          ownerUser:
            payload.ownerUserId === undefined
              ? current.ownerUser
              : payload.ownerUserId
                ? demoUsers.find((item) => item.id === payload.ownerUserId) || null
                : null,
          updatedAt: new Date().toISOString(),
          user: {
            ...current.user,
            fullName: payload.fullName ?? current.user.fullName,
            email: payload.email ?? current.user.email,
            phone: payload.phone ?? current.user.phone,
        },
      };

      demoCustomerRecords = demoCustomerRecords.map((item) => (item.id === id ? updated : item));
      return updated;
    });
  }
}

export async function deleteCustomerRequest(id: string) {
  try {
    return await apiFetch<{ success: boolean }>(`/customers/${id}`, {
      method: 'DELETE',
    });
  } catch (error) {
    return fallbackOrThrow(error, () => {
      demoCustomerRecords = demoCustomerRecords.filter((item) => item.id !== id);
      return { success: true };
    });
  }
}

export async function listUsersRequest() {
  try {
    return await apiFetch<UserRecord[]>('/users');
  } catch (error) {
    return fallbackOrThrow(error, () => demoUsers);
  }
}

export async function listRolesRequest() {
  try {
    const roles = await apiFetch<Array<RoleRecord & { code: string }>>('/roles');
    return roles.map((role) => ({
      ...role,
      code: role.code as UserRole,
    }));
  } catch (error) {
    return fallbackOrThrow(error, () => [
      { id: 'role-super-admin', code: 'SUPER_ADMIN', name: 'Super Admin', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: 'role-admin', code: 'ADMIN', name: 'Admin', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: 'role-manager', code: 'MANAGER', name: 'Manager', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: 'role-staff', code: 'STAFF', name: 'Staff', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: 'role-customer', code: 'CUSTOMER', name: 'Customer', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    ]);
  }
}

export async function createUserRequest(payload: {
  fullName: string;
  email: string;
  password: string;
  phone?: string;
  roleCode: UserRole;
}) {
  try {
    return await apiFetch<UserRecord>('/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  } catch (error) {
    return fallbackOrThrow(error, () => {
      const roleName =
        payload.roleCode === 'SUPER_ADMIN'
          ? 'Super Admin'
          : payload.roleCode === 'ADMIN'
            ? 'Admin'
            : payload.roleCode === 'MANAGER'
              ? 'Manager'
            : payload.roleCode === 'STAFF'
              ? 'Staff'
              : 'Customer';
      const created: UserRecord = {
        id: `user-${Date.now()}`,
        email: payload.email,
        fullName: payload.fullName,
        phone: payload.phone || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        role: {
          code: payload.roleCode,
          name: roleName,
        },
      };
      demoUsers.unshift(created);
      return created;
    });
  }
}

export async function updateUserRequest(
  id: string,
  payload: {
    fullName?: string;
    email?: string;
    password?: string;
    phone?: string;
    roleCode?: UserRole;
  },
) {
  try {
    return await apiFetch<UserRecord>(`/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  } catch (error) {
    return fallbackOrThrow(error, () => {
      const current = demoUsers.find((user) => user.id === id);
      if (!current) {
        throw new Error('User not found');
      }
      const updated: UserRecord = {
        ...current,
        fullName: payload.fullName ?? current.fullName,
        email: payload.email ?? current.email,
        phone: payload.phone ?? current.phone,
        role:
          payload.roleCode && current.role
            ? {
                code: payload.roleCode,
                name:
                  payload.roleCode === 'SUPER_ADMIN'
                    ? 'Super Admin'
                    : payload.roleCode === 'ADMIN'
                      ? 'Admin'
                      : payload.roleCode === 'STAFF'
                        ? 'Staff'
                        : 'Customer',
              }
            : current.role,
        updatedAt: new Date().toISOString(),
      };
      const nextIndex = demoUsers.findIndex((user) => user.id === id);
      if (nextIndex >= 0) {
        demoUsers[nextIndex] = updated;
      }
      return updated;
    });
  }
}

export async function listMediaAssetsRequest(params?: {
  search?: string;
  folder?: string;
  tag?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  try {
    const query = new URLSearchParams();

    if (params?.search) query.set('search', params.search);
    if (params?.folder) query.set('folder', params.folder);
    if (params?.tag) query.set('tag', params.tag);
    if (params?.dateFrom) query.set('dateFrom', params.dateFrom);
    if (params?.dateTo) query.set('dateTo', params.dateTo);

    const queryString = query.toString();
    const suffix = queryString ? `?${queryString}` : '';
    return await apiFetch<MediaAssetRecord[]>(`/media${suffix}`);
  } catch (error) {
    return fallbackOrThrow(error, () => demoMediaAssets);
  }
}

export async function uploadMediaAssetsRequest(formData: FormData) {
  try {
    return await apiFetch<MediaAssetRecord[]>('/media/upload', {
      method: 'POST',
      body: formData,
    });
  } catch (error) {
    return fallbackOrThrow(error, () => {
      const files = formData.getAll('files').filter((item) => item instanceof File) as File[];
      const folder = String(formData.get('folder') || '').trim() || null;
      const tags = String(formData.get('tags') || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);

      const created = files.map((file) => ({
        id: `media-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        filename: file.name,
        originalName: file.name,
        mimeType: file.type || 'image/png',
        sizeBytes: file.size,
        storagePath: file.name,
        title: file.name.replace(/\.[^.]+$/, ''),
        description: String(formData.get('description') || '') || null,
        altText: String(formData.get('altText') || '') || null,
        tags,
        folder,
        fileUrl: URL.createObjectURL(file),
        previewUrl: URL.createObjectURL(file),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        uploadedByUser: demoUsers[1] || null,
      }));

      demoMediaAssets = [...created, ...demoMediaAssets];
      return created;
    });
  }
}

export async function updateMediaAssetRequest(
  id: string,
  payload: {
    title?: string;
    description?: string;
    altText?: string;
    tags?: string;
    folder?: string;
  },
) {
  try {
    return await apiFetch<MediaAssetRecord>(`/media/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  } catch (error) {
    return fallbackOrThrow(error, () => {
      const current = demoMediaAssets.find((item) => item.id === id);
      if (!current) {
        throw new Error('Media asset not found');
      }

      const updated: MediaAssetRecord = {
        ...current,
        title: payload.title ?? current.title,
        description: payload.description ?? current.description,
        altText: payload.altText ?? current.altText,
        folder: payload.folder ?? current.folder,
        tags:
          payload.tags === undefined
            ? current.tags
            : payload.tags
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean),
        updatedAt: new Date().toISOString(),
      };

      demoMediaAssets = demoMediaAssets.map((item) => (item.id === id ? updated : item));
      return updated;
    });
  }
}

export async function deleteMediaAssetRequest(id: string) {
  try {
    return await apiFetch<{ success: boolean }>(`/media/${id}`, {
      method: 'DELETE',
    });
  } catch (error) {
    return fallbackOrThrow(error, () => {
      demoMediaAssets = demoMediaAssets.filter((item) => item.id !== id);
      return { success: true };
    });
  }
}

export async function listContractsRequest() {
  try {
    return await apiFetch<ContractRecord[]>('/contracts');
  } catch (error) {
    return fallbackOrThrow(error, () =>
      adminContracts.map((contract, index) => ({
      id: contract.id,
      contractNumber: contract.id,
      type: contract.type,
      status: contract.status.toUpperCase(),
      startDate: new Date(2025, index, 1).toISOString(),
      endDate: new Date(2028, index, 1).toISOString(),
      termMonths: Number(contract.term.replace(/[^0-9]/g, '')) || 0,
      contractFileUrl: `/contracts/${contract.id}.pdf`,
      customer: {
        id: `customer-${index + 1}`,
        companyName: contract.customer,
        user: {
          fullName: contract.customer,
          email: `customer${index + 1}@example.com`,
        },
      },
      solarSystem: {
        id: `system-${index + 1}`,
        systemCode: `SYS-${index + 1}`,
        name: contract.customer,
        capacityKwp: 12 + index * 8,
        location: 'Ho Chi Minh City',
      },
      servicePackage: {
        id: `package-${index + 1}`,
        name: contract.type,
        contractType: contract.type,
      },
    })));
  }
}

export async function listMyContractsRequest() {
  try {
    return await apiFetch<ContractRecord[]>('/contracts/me');
  } catch (error) {
    return fallbackOrThrow(error, () =>
      customerContracts.map((contract, index) => ({
      id: contract.id,
      contractNumber: contract.id,
      type: contract.type,
      status: contract.status.toUpperCase(),
      startDate: new Date(2025, 0, 1).toISOString(),
      endDate: new Date(2030, 0, 1).toISOString(),
      termMonths: Number(contract.term.replace(/[^0-9]/g, '')) || 0,
      contractFileUrl: `/contracts/${contract.id}.pdf`,
      servicePackage: {
        id: `customer-package-${index + 1}`,
        name: contract.type,
        contractType: contract.type,
      },
      solarSystem: {
        id: `customer-system-${index + 1}`,
        systemCode: 'SYS-DEMO-001',
        name: 'Điện mặt trời Cafe Nắng Xanh',
        capacityKwp: 12.4,
        location: 'Quận 7, TP.HCM',
      },
    })));
  }
}

export async function createContractRequest(payload: {
  customerId: string;
  solarSystemId: string;
  servicePackageId: string;
  type: string;
  status?: string;
  startDate: string;
  endDate?: string;
  termMonths?: number;
  pricePerKwh?: number;
  fixedMonthlyFee?: number;
  interestRate?: number;
  vatRate?: number;
  contractFileUrl?: string;
}) {
  return apiFetch<ContractRecord>('/contracts', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateContractRequest(
  id: string,
  payload: Partial<{
    customerId: string;
    solarSystemId: string;
    servicePackageId: string;
    type: string;
    status: string;
    startDate: string;
    endDate: string;
    termMonths: number;
    pricePerKwh: number;
    fixedMonthlyFee: number;
    interestRate: number;
    vatRate: number;
    contractFileUrl: string;
  }>,
) {
  return apiFetch<ContractRecord>(`/contracts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteContractRequest(id: string) {
  return apiFetch<{ success: boolean }>(`/contracts/${id}`, {
    method: 'DELETE',
  });
}

export async function listServicePackagesRequest() {
  return apiFetch<ServicePackageRecord[]>('/service-packages');
}

export async function createServicePackageRequest(payload: {
  packageCode: string;
  name: string;
  contractType: string;
  shortDescription?: string;
  pricePerKwh?: number;
  fixedMonthlyFee?: number;
  maintenanceFee?: number;
  annualEscalationRate?: number;
  vatRate?: number;
  lateFeeRate?: number;
  earlyDiscountRate?: number;
  defaultTermMonths?: number;
  billingRule?: string;
  notes?: string;
  isActive?: boolean;
}) {
  return apiFetch<ServicePackageRecord>('/service-packages', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateServicePackageRequest(
  id: string,
  payload: Partial<{
    packageCode: string;
    name: string;
    contractType: string;
    shortDescription?: string;
    pricePerKwh?: number;
    fixedMonthlyFee?: number;
    maintenanceFee?: number;
    annualEscalationRate?: number;
    vatRate?: number;
    lateFeeRate?: number;
    earlyDiscountRate?: number;
    defaultTermMonths?: number;
    billingRule?: string;
    notes?: string;
    isActive?: boolean;
  }>,
) {
  return apiFetch<ServicePackageRecord>(`/service-packages/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteServicePackageRequest(id: string) {
  return apiFetch<{ success: boolean }>(`/service-packages/${id}`, {
    method: 'DELETE',
  });
}

export async function listInvoicesRequest() {
  try {
    return await apiFetch<InvoiceRecord[]>('/invoices');
  } catch (error) {
    return fallbackOrThrow(error, () =>
      customerInvoices.map((invoice, index) => ({
      id: invoice.id,
      invoiceNumber: invoice.number,
      billingMonth: 3 - index,
      billingYear: 2026,
      issuedAt: new Date(2026, 2 - index, 2).toISOString(),
      dueDate: new Date(2026, 2 - index, 25).toISOString(),
      subtotal: invoice.amount,
      vatAmount: Math.round(invoice.amount * 0.08),
      penaltyAmount: 0,
      discountAmount: 0,
      totalAmount: invoice.amount,
      paidAmount: invoice.status === 'Paid' ? invoice.amount : 0,
      status: invoice.status.toUpperCase() as InvoiceRecord['status'],
      customerId: 'demo-customer-001',
      contractId: 'CTR-DEMO-001',
      customer: {
        id: 'demo-customer-001',
        companyName: invoice.customer || 'Cafe Nang Xanh',
        user: { fullName: 'Nguyen Van A', email: 'customer@example.com' },
      },
      contract: null,
      items: [],
      payments: [],
    })));
  }
}

export async function listMyInvoicesRequest() {
  try {
    return await apiFetch<InvoiceRecord[]>('/invoices/me');
  } catch (error) {
    return fallbackOrThrow(error, () => demoCustomerDashboard.invoices.slice(0, 3) as InvoiceRecord[]);
  }
}

export async function generateInvoiceRequest(contractId: string, month: number, year: number) {
  return apiFetch<InvoiceRecord>(`/invoices/generate/${contractId}?month=${month}&year=${year}`, {
    method: 'POST',
  });
}

export async function listPaymentsRequest() {
  try {
    return await apiFetch<PaymentRecord[]>('/payments');
  } catch (error) {
    return fallbackOrThrow(error, () =>
      customerPayments.map((payment, index) => ({
      id: payment.id,
      paymentCode: payment.id,
      gateway: payment.gateway,
      method: payment.method,
      amount: payment.amount,
      status: payment.status.toUpperCase() as PaymentRecord['status'],
      paidAt: new Date(2026, 2 - index, 8).toISOString(),
      createdAt: new Date(2026, 2 - index, 8).toISOString(),
      invoice: {
        id: payment.invoiceNumber,
        invoiceNumber: payment.invoiceNumber,
        billingMonth: 3 - index,
        billingYear: 2026,
        totalAmount: payment.amount,
        status: 'PAID',
      },
    })));
  }
}

export async function listMyPaymentsRequest() {
  try {
    return await apiFetch<PaymentRecord[]>('/payments/me');
  } catch (error) {
    return fallbackOrThrow(error, () => customerPayments.map((payment, index) => ({
      id: payment.id,
      paymentCode: payment.id,
      gateway: payment.gateway,
      method: payment.method,
      amount: payment.amount,
      status: payment.status.toUpperCase() as PaymentRecord['status'],
      paidAt: new Date(2026, 2 - index, 8).toISOString(),
      createdAt: new Date(2026, 2 - index, 8).toISOString(),
      invoice: {
        id: payment.invoiceNumber,
        invoiceNumber: payment.invoiceNumber,
        billingMonth: 3 - index,
        billingYear: 2026,
        totalAmount: payment.amount,
        status: 'PAID',
      },
    })));
  }
}

export async function mockPayInvoiceRequest(invoiceId: string, method: string) {
  return apiFetch<PaymentRecord>(`/payments/${invoiceId}/mock-pay`, {
    method: 'POST',
    body: JSON.stringify({ method }),
  });
}

export async function submitManualPaymentRequest(payload: {
  invoiceId: string;
  method?: string;
  amount?: number;
  referenceNote?: string;
  proof: File;
}) {
  const formData = new FormData();
  formData.append('proof', payload.proof);

  if (payload.method?.trim()) {
    formData.append('method', payload.method.trim());
  }

  if (payload.amount !== undefined) {
    formData.append('amount', String(payload.amount));
  }

  if (payload.referenceNote?.trim()) {
    formData.append('referenceNote', payload.referenceNote.trim());
  }

  return apiFetch<PaymentRecord>(`/payments/${payload.invoiceId}/manual-submission`, {
    method: 'POST',
    body: formData,
  });
}

export async function reviewPaymentRequest(
  paymentId: string,
  payload: {
    status: 'SUCCESS' | 'FAILED';
    reviewNote?: string;
  },
) {
  return apiFetch<PaymentRecord>(`/payments/${paymentId}/review`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

function buildSupportTicketFallback() {
  return customerTickets.map((ticket) => ({
    id: ticket.id,
    ticketNumber: ticket.id,
    title: ticket.title,
    subject: ticket.title,
    description: ticket.title,
    status: ticket.status.toUpperCase().replace(' ', '_') as SupportTicketRecord['status'],
    priority: ticket.priority.toUpperCase() as SupportTicketRecord['priority'],
    category: 'GENERAL' as SupportTicketRecord['category'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    unread: false,
    customer: {
      id: 'demo-customer-001',
      companyName: ticket.owner || 'Cafe Nang Xanh',
      user: {
        fullName: ticket.owner || 'Nguyen Van A',
        email: 'customer@example.com',
      },
    },
    messages: [],
    attachments: [],
    participants: [],
  }));
}

export async function listAuditLogsRequest(filters?: {
  entityType?: string;
  entityId?: string;
  action?: string;
  limit?: number;
}) {
  const query = new URLSearchParams();
  if (filters?.entityType?.trim()) {
    query.set('entityType', filters.entityType.trim());
  }
  if (filters?.entityId?.trim()) {
    query.set('entityId', filters.entityId.trim());
  }
  if (filters?.action?.trim()) {
    query.set('action', filters.action.trim());
  }
  if (typeof filters?.limit === 'number') {
    query.set('limit', String(filters.limit));
  }

  try {
    return await apiFetch<AuditLogRecord[]>(
      `/audit-logs${query.toString() ? `?${query.toString()}` : ''}`,
    );
  } catch (error) {
    return fallbackOrThrow(error, () => []);
  }
}

export async function getEntityTimelineRequest(
  entityType: string,
  entityId: string,
  limit = 50,
) {
  try {
    return await apiFetch<EntityTimelineResponse>(
      `/audit-logs/timeline/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}?limit=${limit}`,
    );
  } catch (error) {
    return fallbackOrThrow(error, () => ({
      assignment: null,
      notes: [],
      timeline: [],
    }));
  }
}

export async function listEntityInternalNotesRequest(entityType: string, entityId: string) {
  try {
    return await apiFetch<InternalNoteRecord[]>(
      `/audit-logs/internal-notes/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`,
    );
  } catch (error) {
    return fallbackOrThrow(error, () => []);
  }
}

export async function createEntityInternalNoteRequest(
  entityType: string,
  entityId: string,
  payload: {
    body: string;
    moduleKey?: string;
  },
) {
  try {
    return await apiFetch<InternalNoteRecord>(
      `/audit-logs/internal-notes/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  } catch (error) {
    return fallbackOrThrow(error, () => ({
      id: `note-${Date.now()}`,
      entityType,
      entityId,
      body: payload.body,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdByUser: null,
    }));
  }
}

export async function getEntityAssignmentRequest(entityType: string, entityId: string) {
  try {
    return await apiFetch<EntityAssignmentRecord | null>(
      `/audit-logs/assignment/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`,
    );
  } catch (error) {
    return fallbackOrThrow(error, () => null);
  }
}

export async function updateEntityAssignmentRequest(
  entityType: string,
  entityId: string,
  payload: {
    assignedToUserId?: string | null;
    moduleKey?: string;
  },
) {
  try {
    return await apiFetch<EntityAssignmentRecord>(
      `/audit-logs/assignment/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      },
    );
  } catch (error) {
    return fallbackOrThrow(error, () => ({
      id: `assignment-${entityType}-${entityId}`,
      entityType,
      entityId,
      assignedAt: payload.assignedToUserId ? new Date().toISOString() : null,
      assignedToUser: null,
      assignedByUser: null,
      lastHandledByUser: null,
    }));
  }
}

export async function listSupportTicketsRequest(filters?: {
  status?: string;
  priority?: string;
  customerId?: string;
  assigneeUserId?: string;
  solarSystemId?: string;
  search?: string;
}) {
  try {
    const query = new URLSearchParams();
    Object.entries(filters || {}).forEach(([key, value]) => {
      if (value?.trim()) {
        query.set(key, value.trim());
      }
    });

    return await apiFetch<SupportTicketRecord[]>(
      `/support-tickets${query.toString() ? `?${query.toString()}` : ''}`,
    );
  } catch (error) {
    return fallbackOrThrow(error, () => buildSupportTicketFallback());
  }
}

export async function listMySupportTicketsRequest() {
  try {
    return await apiFetch<SupportTicketRecord[]>('/support-tickets/me');
  } catch (error) {
    return fallbackOrThrow(error, () => buildSupportTicketFallback());
  }
}

export async function createSupportTicketRequest(payload: {
  subject?: string;
  title?: string;
  message?: string;
  description?: string;
  priority?: string;
  category?: string;
  solarSystemId?: string;
  attachments?: File[];
}) {
  const formData = new FormData();
  const subject = payload.subject?.trim() || payload.title?.trim();
  const message = payload.message?.trim() || payload.description?.trim();

  if (subject) {
    formData.append('subject', subject);
  }
  if (message) {
    formData.append('message', message);
  }
  if (payload.priority?.trim()) {
    formData.append('priority', payload.priority.trim());
  }
  if (payload.category?.trim()) {
    formData.append('category', payload.category.trim());
  }
  if (payload.solarSystemId?.trim()) {
    formData.append('solarSystemId', payload.solarSystemId.trim());
  }
  (payload.attachments || []).forEach((file) => {
    formData.append('attachments', file);
  });

  return apiFetch<SupportTicketRecord>('/support-tickets', {
    method: 'POST',
    body: formData,
  });
}

export async function getSupportTicketRequest(ticketId: string) {
  return apiFetch<SupportTicketRecord>(`/support-tickets/${ticketId}`);
}

export async function replySupportTicketRequest(
  ticketId: string,
  payload: {
    message: string;
    isInternal?: boolean;
    attachments?: File[];
  },
) {
  const formData = new FormData();
  formData.append('message', payload.message);

  if (payload.isInternal) {
    formData.append('isInternal', 'true');
  }

  (payload.attachments || []).forEach((file) => {
    formData.append('attachments', file);
  });

  return apiFetch<SupportTicketRecord>(`/support-tickets/${ticketId}/messages`, {
    method: 'POST',
    body: formData,
  });
}

export async function updateSupportTicketStatusRequest(ticketId: string, status: string) {
  return apiFetch<SupportTicketRecord>(`/support-tickets/${ticketId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function assignSupportTicketRequest(ticketId: string, assigneeUserId?: string | null) {
  return apiFetch<SupportTicketRecord>(`/support-tickets/${ticketId}/assign`, {
    method: 'PATCH',
    body: JSON.stringify({ assigneeUserId }),
  });
}

export async function markSupportTicketReadRequest(ticketId: string) {
  return apiFetch<SupportTicketUnreadSummary>(`/support-tickets/${ticketId}/read`, {
    method: 'PATCH',
  });
}

export async function supportTicketUnreadSummaryRequest() {
  try {
    return await apiFetch<SupportTicketUnreadSummary>('/support-tickets/unread-summary');
  } catch (error) {
    return fallbackOrThrow(error, () => ({
      unreadTickets: customerTickets.filter((ticket) => ticket.status !== 'Closed').length,
    }));
  }
}

export async function downloadSupportTicketAttachmentRequest(
  ticketId: string,
  attachmentId: string,
  filename?: string,
) {
  const token =
    typeof window !== 'undefined'
      ? (() => {
          try {
            const raw = window.localStorage.getItem(SESSION_KEY);
            if (!raw) return '';
            return (JSON.parse(raw) as SessionPayload).accessToken || '';
          } catch {
            return '';
          }
        })()
      : '';

  const response = await fetch(
    buildApiUrl(`/support-tickets/${ticketId}/attachments/${attachmentId}/file`),
    {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
  );

  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }

  const blob = await response.blob();
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = filename || `${attachmentId}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

export async function createSupportTicketLegacyReplyRequest(ticketId: string, message: string) {
  return apiFetch<TicketMessageRecord>(`/support-tickets/${ticketId}/reply`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
}

export async function listPublicMarketingPagesRequest() {
  try {
    return await apiFetch<MarketingPageRecord[]>('/marketing-pages/public');
  } catch (error) {
    return fallbackOrThrow(error, () => loadDemoMarketingPages().filter((page) => page.published));
  }
}

export async function listMarketingPagesRequest() {
  try {
    return await apiFetch<MarketingPageRecord[]>('/marketing-pages');
  } catch (error) {
    return fallbackOrThrow(error, () => loadDemoMarketingPages());
  }
}

export async function updateMarketingPageRequest(
  key: string,
  payload: Partial<Pick<MarketingPageRecord, 'name' | 'description' | 'published' | 'content'>>,
) {
  try {
    return await apiFetch<MarketingPageRecord>(`/marketing-pages/${key}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  } catch (error) {
    return fallbackOrThrow(error, () => {
      const current = loadDemoMarketingPages();
      const fallback = buildDefaultMarketingPages().find((page) => page.key === key);

      if (!fallback) {
        throw new Error('Marketing page not found');
      }

      const updated: MarketingPageRecord = {
        ...(current.find((page) => page.key === key) || fallback),
        ...payload,
        updatedAt: new Date().toISOString(),
      };

      const nextPages = current.some((page) => page.key === key)
        ? current.map((page) => (page.key === key ? updated : page))
        : [...current, updated];

      saveDemoMarketingPages(nextPages);
      return updated;
    });
  }
}

export async function websiteSettingsPublicRequest(): Promise<
  WebsiteSettingRecord<Partial<PublicSiteConfig>>
> {
  try {
    return await apiFetch<WebsiteSettingRecord<Partial<PublicSiteConfig>>>(
      '/website-settings/public',
    );
  } catch (error) {
    return fallbackOrThrow(error, () => loadDemoWebsiteSettings());
  }
}

export async function websiteSettingsRequest(): Promise<
  WebsiteSettingRecord<Partial<PublicSiteConfig>>
> {
  try {
    return await apiFetch<WebsiteSettingRecord<Partial<PublicSiteConfig>>>(
      '/website-settings',
    );
  } catch (error) {
    return fallbackOrThrow(error, () => loadDemoWebsiteSettings());
  }
}

export async function updateWebsiteSettingsRequest(payload: {
  name?: string;
  description?: string;
  content: Partial<PublicSiteConfig>;
}): Promise<WebsiteSettingRecord<Partial<PublicSiteConfig>>> {
  try {
    return await apiFetch<WebsiteSettingRecord<Partial<PublicSiteConfig>>>(
      '/website-settings',
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      },
    );
  } catch (error) {
    return fallbackOrThrow(error, () => {
      const updated: WebsiteSettingRecord<Partial<PublicSiteConfig>> = {
        ...loadDemoWebsiteSettings(),
        ...payload,
        content: payload.content,
        updatedAt: new Date().toISOString(),
      };

      saveDemoWebsiteSettings(updated);
      return updated;
    });
  }
}

export async function createContactInquiryRequest(payload: {
  fullName: string;
  email: string;
  phone?: string;
  companyName?: string;
  siteCount?: string;
  message: string;
  sourcePage?: string;
}) {
  try {
    return await apiFetch<ContactInquiryRecord>('/contact-inquiries/public', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  } catch (error) {
    return fallbackOrThrow(error, () => ({
      id: `lead-${Date.now()}`,
      fullName: payload.fullName,
      email: payload.email,
      phone: payload.phone || null,
      companyName: payload.companyName || null,
      siteCount: payload.siteCount || null,
      message: payload.message,
      sourcePage: payload.sourcePage || 'contact',
      status: 'NEW',
      internalNote: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      handledBy: null,
    }));
  }
}

export async function listContactInquiriesRequest(status?: string) {
  try {
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    return await apiFetch<ContactInquiryRecord[]>(`/contact-inquiries${query}`);
  } catch (error) {
    return fallbackOrThrow(error, () =>
      status ? demoContactInquiries.filter((item) => item.status === status) : demoContactInquiries,
    );
  }
}

export async function updateContactInquiryRequest(
  id: string,
  payload: {
    status?: ContactInquiryRecord['status'];
    internalNote?: string;
  },
) {
  try {
    return await apiFetch<ContactInquiryRecord>(`/contact-inquiries/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  } catch (error) {
    return fallbackOrThrow(error, () => ({
      ...(demoContactInquiries.find((item) => item.id === id) || demoContactInquiries[0]),
      ...payload,
      updatedAt: new Date().toISOString(),
    }));
  }
}

export async function listPublicContentPostsRequest() {
  try {
    return await apiFetch<ContentPost[]>('/content-posts/public');
  } catch (error) {
    return fallbackOrThrow(error, () => demoContentPosts.filter((post) => post.status === 'PUBLISHED'));
  }
}

export async function getPublicContentPostRequest(slug: string) {
  try {
    return await apiFetch<ContentPost>(`/content-posts/public/${slug}`);
  } catch (error) {
    return fallbackOrThrow(error, () => {
      const fallback = demoContentPosts.find((post) => post.slug === slug);
      if (!fallback) {
        throw new Error('Post not found');
      }

      return fallback;
    });
  }
}

export async function listAdminContentPostsRequest() {
  try {
    return await apiFetch<ContentPost[]>('/content-posts');
  } catch (error) {
    return fallbackOrThrow(error, () => demoContentPosts);
  }
}

export async function createContentPostRequest(payload: Partial<ContentPost>) {
  return apiFetch<ContentPost>('/content-posts', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateContentPostRequest(id: string, payload: Partial<ContentPost>) {
  return apiFetch<ContentPost>(`/content-posts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteContentPostRequest(id: string) {
  return apiFetch<{ success: boolean }>(`/content-posts/${id}`, {
    method: 'DELETE',
  });
}

export async function downloadInvoicePdfRequest(invoiceId: string) {
  const token =
    typeof window !== 'undefined'
      ? (() => {
          try {
            const raw = window.localStorage.getItem(SESSION_KEY);
            if (!raw) return '';
            return (JSON.parse(raw) as SessionPayload).accessToken || '';
          } catch {
            return '';
          }
        })()
      : '';

  const response = await fetch(`${getApiBaseUrl()}/invoices/${invoiceId}/pdf`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }

  const blob = await response.blob();
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = `${invoiceId}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

export async function downloadPaymentProofRequest(paymentId: string) {
  const token =
    typeof window !== 'undefined'
      ? (() => {
          try {
            const raw = window.localStorage.getItem(SESSION_KEY);
            if (!raw) return '';
            return (JSON.parse(raw) as SessionPayload).accessToken || '';
          } catch {
            return '';
          }
        })()
      : '';

  const response = await fetch(`${getApiBaseUrl()}/payments/${paymentId}/proof`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }

  const blob = await response.blob();
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = `${paymentId}-proof`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

export async function zaloNotificationsStatusRequest() {
  return apiFetch<ZaloNotificationStatus>('/zalo-notifications/status');
}

export async function zaloNotificationsSettingsRequest() {
  return apiFetch<ZaloSettingsRecord>('/zalo-notifications/settings');
}

export async function updateZaloNotificationsSettingsRequest(payload: {
  appId?: string;
  appSecret?: string;
  oaId?: string;
  accessToken?: string;
  refreshToken?: string;
  apiBaseUrl?: string;
  templateInvoiceId?: string;
  templateReminderId?: string;
  templatePaidId?: string;
  templateOtpId?: string;
}) {
  return apiFetch<ZaloSettingsRecord>('/zalo-notifications/settings', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function testZaloConnectionRequest(payload: {
  phone?: string;
  dryRun?: boolean;
}) {
  return apiFetch<ZaloTestResult>('/zalo-notifications/test', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function listZaloMessageLogsRequest(invoiceId?: string, limit = 20) {
  const query = new URLSearchParams();
  if (invoiceId) {
    query.set('invoiceId', invoiceId);
  }
  query.set('limit', String(limit));

  return apiFetch<ZaloMessageLogRecord[]>(
    `/zalo-notifications/logs${query.toString() ? `?${query.toString()}` : ''}`,
  );
}

export async function sendZaloInvoiceNotificationRequest(
  invoiceId: string,
  payload?: {
    templateType?: ZaloTemplateType;
    recipientPhone?: string;
    dryRun?: boolean;
  },
) {
  return apiFetch<ZaloSendResult>(`/zalo-notifications/invoices/${invoiceId}/send`, {
    method: 'POST',
    body: JSON.stringify(payload || {}),
  });
}

export async function aiAssistantStatusRequest(): Promise<AiAssistantStatus> {
  try {
    return await apiFetch<AiAssistantStatus>('/ai/status');
  } catch (error) {
    return fallbackOrThrow(error, () => ({
      provider: 'openai',
      configured: false,
      model: 'gpt-5.4-mini',
    }));
  }
}

export async function aiAssistantSettingsRequest(): Promise<AiAssistantStatus> {
  try {
    return await apiFetch<AiAssistantStatus>('/ai/settings');
  } catch (error) {
    return fallbackOrThrow(error, () => ({
      provider: 'openai',
      configured: false,
      model: 'gpt-5.4-mini',
      source: 'unset',
      hasStoredApiKey: false,
      updatedAt: null,
    }));
  }
}

export async function updateAiAssistantSettingsRequest(
  payload: AiAssistantSettingsPayload,
): Promise<AiAssistantStatus> {
  try {
    return await apiFetch<AiAssistantStatus>('/ai/settings', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  } catch (error) {
    return fallbackOrThrow(error, () => ({
      provider: 'openai',
      configured: Boolean(payload.apiKey?.trim()),
      model: payload.model?.trim() || 'gpt-5.4-mini',
      source: payload.clearStoredApiKey ? 'unset' : payload.apiKey?.trim() ? 'database' : 'unset',
      hasStoredApiKey: Boolean(payload.apiKey?.trim() && !payload.clearStoredApiKey),
      updatedAt: new Date().toISOString(),
    }));
  }
}

export async function aiAssistantChatRequest(payload: {
  messages: AiAssistantMessage[];
  taskLabel?: string;
}): Promise<AiAssistantResponse> {
  try {
    return await apiFetch<AiAssistantResponse>('/ai/chat', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  } catch (error) {
    return fallbackOrThrow(error, () => ({
      id: `demo-ai-${Date.now()}`,
      model: 'gpt-5.4-mini',
      createdAt: new Date().toISOString(),
      reply:
        'Chế độ demo hiện chưa có kết nối OpenAI thật. Hãy thêm OPENAI_API_KEY trên máy chủ để dùng ChatGPT trực tiếp trong admin.',
    }));
  }
}

export async function listAiActionDraftsRequest() {
  return apiFetch<AiActionDraftRecord[]>('/ai/actions/drafts');
}

export async function runAiActionRequest(payload: {
  actionType: string;
  title?: string;
  instruction: string;
  context?: string;
  targetType?: string;
  targetId?: string;
}) {
  return apiFetch<AiActionRunResult>('/ai/actions/run', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function saveAiActionDraftRequest(payload: {
  actionType: string;
  title: string;
  prompt?: string;
  content: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}) {
  return apiFetch<AiActionDraftRecord>('/ai/actions/drafts', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function applyAiActionRequest(payload: {
  draftId?: string;
  actionType: string;
  title: string;
  content: string;
  targetType?: string;
  targetId?: string;
}) {
  return apiFetch<{
    success: boolean;
    targetType: string;
    appliedResult: Record<string, unknown>;
  }>('/ai/actions/apply', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function generateInvoiceReminderDraftsRequest(payload: {
  billingMonth?: number;
  billingYear?: number;
  templateType?: 'UPCOMING' | 'DUE' | 'OVERDUE' | 'ALL';
}) {
  return apiFetch<AiActionDraftRecord[]>('/ai/actions/reminders/generate', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function websiteAiChatRequest(payload: {
  messages: AiAssistantMessage[];
  visitorId: string;
  humanCheckConfirmed: boolean;
  pagePath?: string;
}): Promise<WebsiteAiChatResponse> {
  try {
    return await apiFetch<WebsiteAiChatResponse>('/ai/public-chat', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  } catch (error) {
    return fallbackOrThrow(error, () => ({
      id: `demo-webchat-${Date.now()}`,
      model: 'gpt-5.4-mini',
      createdAt: new Date().toISOString(),
      remainingMessages: 3,
      leadSuggested: true,
      reply:
        'Trợ lý AI đang ở chế độ dự phòng. Bạn có thể hỏi nhanh về bảng giá, mô hình triển khai hoặc để lại số điện thoại để đội ngũ Moka Solar liên hệ trực tiếp.',
    }));
  }
}
