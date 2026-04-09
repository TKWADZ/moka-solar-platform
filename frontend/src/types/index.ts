export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'STAFF' | 'CUSTOMER';
export type PermissionCode =
  | 'admin.dashboard.read'
  | 'users.read'
  | 'users.manage'
  | 'users.archive'
  | 'customers.read'
  | 'customers.manage'
  | 'systems.read'
  | 'systems.manage'
  | 'contracts.read'
  | 'contracts.manage'
  | 'billing.read'
  | 'billing.manage'
  | 'payments.read'
  | 'payments.manage'
  | 'reports.read'
  | 'support.read'
  | 'support.reply'
  | 'support.assign'
  | 'support.internal_notes'
  | 'notifications.read'
  | 'audit.read'
  | 'internal_notes.read'
  | 'internal_notes.manage'
  | 'assignments.read'
  | 'assignments.manage'
  | 'activity.read'
  | 'website.read'
  | 'website.manage'
  | 'integrations.read'
  | 'integrations.execute'
  | 'integration.secrets.view'
  | 'integration.secrets.manage'
  | 'ai.read'
  | 'ai.manage';
export type CustomerStatus = 'ACTIVE' | 'ONBOARDING' | 'ON_HOLD' | 'INACTIVE';
export type MonitoringProvider = 'SEMS_PORTAL' | 'SOLARMAN' | 'DEYE' | 'LUXPOWER';
export type MarketingPageKey = 'home' | 'about' | 'pricing' | 'solutions' | 'contact';
export type MarketingLocale = 'vi' | 'en';

export type CmsLink = {
  label: string;
  href: string;
};

export type MarketingValueBlock = {
  label: string;
  body: string;
};

export type MarketingStatBlock = {
  title: string;
  value: string;
  subtitle: string;
};

export type MarketingStoryPanel = {
  eyebrow: string;
  title: string;
  body: string;
  imageUrl: string;
};

export type MarketingOfferCard = {
  contractType: string;
  name: string;
  badge: string;
  summary: string;
  highlights: string[];
  pricing: string;
};

export type HomePageContent = {
  hero: {
    eyebrow: string;
    title: string;
    description: string;
    imageUrl: string;
    primaryCta: CmsLink;
    secondaryCta: CmsLink;
    featureCard: {
      eyebrow: string;
      title: string;
    };
    miniCards: Array<{
      eyebrow: string;
      title: string;
    }>;
    metricCard: {
      eyebrow: string;
      value: string;
      body: string;
      ctaLabel: string;
      ctaHref: string;
    };
  };
  stats: MarketingStatBlock[];
  teslaSection: {
    eyebrow: string;
    title: string;
    buttonLabel: string;
    buttonHref: string;
  };
  storyPanels: MarketingStoryPanel[];
  improvementCard: {
    eyebrow: string;
    title: string;
    signals: string[];
  };
  switchCard: {
    eyebrow: string;
    title: string;
    before: MarketingValueBlock;
    after: MarketingValueBlock;
    bestFit: MarketingValueBlock;
  };
  packagesSection: {
    eyebrow: string;
    title: string;
    buttonLabel: string;
    buttonHref: string;
  };
  newsroomSection: {
    eyebrow: string;
    title: string;
    buttonLabel: string;
    buttonHref: string;
  };
  closingCta: {
    eyebrow: string;
    title: string;
    primaryCta: CmsLink;
    secondaryCta: CmsLink;
  };
};

export type AboutPageContent = {
  hero: {
    eyebrow: string;
    title: string;
    description: string;
  };
  cards: Array<{
    eyebrow: string;
    title: string;
    body: string;
  }>;
};

export type PricingPageContent = {
  hero: {
    eyebrow: string;
    title: string;
    description: string;
  };
  offers: MarketingOfferCard[];
  notesSection: {
    eyebrow: string;
    title: string;
    notes: string[];
  };
  ctaCard: {
    eyebrow: string;
    title: string;
    description: string;
    primaryCta: CmsLink;
    secondaryCta: CmsLink;
  };
};

export type SolutionsPageContent = {
  hero: {
    eyebrow: string;
    title: string;
    description: string;
  };
  tracks: MarketingStoryPanel[];
  deliverySection: {
    eyebrow: string;
    title: string;
    steps: string[];
  };
  packagesSection: {
    eyebrow: string;
    title: string;
  };
  nextStepCta: {
    eyebrow: string;
    title: string;
    primaryCta: CmsLink;
    secondaryCta: CmsLink;
  };
};

export type ContactPageContent = {
  hero: {
    eyebrow: string;
    title: string;
    description: string;
  };
  contactCard: {
    eyebrow: string;
    title: string;
    hotline: string;
    email: string;
    office: string;
  };
  formSection: {
    eyebrow: string;
    title: string;
    namePlaceholder: string;
    emailPlaceholder: string;
    companyPlaceholder: string;
    siteCountPlaceholder: string;
    messagePlaceholder: string;
    submitLabel: string;
    successMessage: string;
  };
};

export type MarketingPageContentByKey = {
  home: HomePageContent;
  about: AboutPageContent;
  pricing: PricingPageContent;
  solutions: SolutionsPageContent;
  contact: ContactPageContent;
};

export type MarketingPageRecord = {
  id: string;
  key: MarketingPageKey;
  name: string;
  description?: string | null;
  published: boolean;
  sortOrder: number;
  content: {
    vi: MarketingPageContentByKey[MarketingPageKey];
    en: MarketingPageContentByKey[MarketingPageKey];
  };
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
};

export type WebsiteSettingRecord<T = Record<string, unknown>> = {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  content: T;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
};

export type ContactInquiryStatus = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'CLOSED';

export type ContactInquiryRecord = {
  id: string;
  fullName: string;
  email: string;
  phone?: string | null;
  companyName?: string | null;
  siteCount?: string | null;
  message: string;
  sourcePage: string;
  status: ContactInquiryStatus;
  internalNote?: string | null;
  createdAt: string;
  updatedAt: string;
  handledBy?: {
    id: string;
    fullName: string;
    email?: string | null;
    role?: {
      code: UserRole;
      name: string;
    } | null;
  } | null;
};

export type NavItem = {
  href: string;
  label: string;
  description?: string;
  featureKey?: string;
};

export type SessionUser = {
  id: string;
  email?: string | null;
  phone?: string | null;
  phoneVerifiedAt?: string | null;
  fullName: string;
  role: UserRole;
  roleId?: string | null;
  permissions?: PermissionCode[];
  customerId?: string | null;
  secondFactorReady?: boolean;
};

export type UserRecord = {
  id: string;
  email?: string | null;
  fullName: string;
  phone?: string | null;
  createdAt: string;
  updatedAt: string;
  role?: {
    code: UserRole;
    name: string;
  } | null;
};

export type RoleRecord = {
  id: string;
  code: UserRole;
  name: string;
  permissions?: PermissionCode[];
  createdAt: string;
  updatedAt: string;
};

export type AuditActorRecord = {
  id?: string | null;
  fullName?: string | null;
  email?: string | null;
  role?:
    | {
        code?: UserRole | string | null;
        name?: string | null;
      }
    | null;
};

export type AuditLogRecord = {
  id: string;
  action: string;
  moduleKey?: string | null;
  entityType: string;
  entityId?: string | null;
  payload?: Record<string, unknown> | null;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string;
  user?: AuditActorRecord | null;
};

export type InternalNoteRecord = {
  id: string;
  entityType: string;
  entityId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  createdByUser?: AuditActorRecord | null;
};

export type EntityAssignmentRecord = {
  id: string;
  entityType: string;
  entityId: string;
  assignedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  assignedToUser?: AuditActorRecord | null;
  assignedByUser?: AuditActorRecord | null;
  lastHandledByUser?: AuditActorRecord | null;
};

export type ActivityTimelineEntry = {
  id: string;
  kind: 'AUDIT' | 'INTERNAL_NOTE' | 'MESSAGE';
  action?: string | null;
  moduleKey?: string | null;
  body?: string | null;
  createdAt: string;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
  payload?: Record<string, unknown> | null;
  actor?: AuditActorRecord | null;
  metadata?: Record<string, unknown> | null;
};

export type EntityTimelineResponse = {
  assignment?: EntityAssignmentRecord | null;
  notes: InternalNoteRecord[];
  timeline: ActivityTimelineEntry[];
};

export type SessionPayload = {
  accessToken: string;
  refreshToken?: string;
  user: SessionUser;
};

export type OtpRequestResult = {
  success: boolean;
  requestId: string;
  provider: string;
  deliveryChannel: string;
  deliveryMode: string;
  expiresAt: string;
  resendAvailableAt: string;
  cooldownSeconds: number;
  phonePreview?: string | null;
  debugCode?: string;
  message: string;
};

export type LoginOtpRequestResult = OtpRequestResult;

export type AiAssistantStatus = {
  provider: 'openai';
  configured: boolean;
  model: string;
  source?: 'database' | 'env' | 'unset';
  hasStoredApiKey?: boolean;
  updatedAt?: string | null;
};

export type AiAssistantSettingsPayload = {
  apiKey?: string;
  model?: string;
  clearStoredApiKey?: boolean;
};

export type AiAssistantMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type AiAssistantResponse = {
  id: string;
  model: string;
  reply: string;
  createdAt: string;
};

export type AiActionType =
  | 'WRITE_ARTICLE'
  | 'EDIT_CONTENT'
  | 'GENERATE_FAQ'
  | 'INVOICE_REMINDER'
  | 'CUSTOMER_MESSAGE';

export type AiActionRunResult = {
  id: string;
  actionType: AiActionType;
  title: string;
  content: string;
  suggestedTargetType?: string | null;
  model: string;
  createdAt: string;
};

export type AiActionDraftRecord = {
  id: string;
  actionType: string;
  title: string;
  prompt?: string | null;
  content: string;
  targetType?: string | null;
  targetId?: string | null;
  status: string;
  metadata?: Record<string, unknown> | null;
  appliedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WebsiteAiChatResponse = {
  id: string;
  model: string;
  reply: string;
  createdAt: string;
  remainingMessages: number;
  leadSuggested?: boolean;
};

export type ChartPoint = {
  name: string;
  solar?: number;
  load?: number;
  revenue?: number;
  grid?: number;
};

export type StatCardItem = {
  title: string;
  value: string;
  subtitle?: string;
  delta?: string;
  trend?: 'up' | 'down' | 'neutral';
};

export type InvoiceRow = {
  id: string;
  number: string;
  month: string;
  dueDate: string;
  amount: number;
  status: 'Paid' | 'Issued' | 'Overdue' | 'Partial' | 'Pending';
  customer?: string;
  model?: string;
  loadConsumedKwh?: number | null;
  previousReading?: number | null;
  currentReading?: number | null;
  sourceLabel?: string | null;
};

export type PaymentRow = {
  id: string;
  invoiceNumber: string;
  method: string;
  gateway: string;
  amount: number;
  status: 'Success' | 'Pending' | 'Failed';
  paidAt: string;
};

export type TicketRow = {
  id: string;
  title: string;
  status: 'Open' | 'In Progress' | 'Resolved' | 'Closed';
  priority: 'Low' | 'Medium' | 'High' | 'Urgent';
  updatedAt: string;
  owner?: string;
};

export type PackageCard = {
  id: string;
  name: string;
  contractType: string;
  badge: string;
  summary: string;
  highlights: string[];
  pricing: string;
};

export type CustomerRow = {
  id: string;
  name: string;
  email: string;
  segment: string;
  site: string;
  system: string;
  status: string;
  mrr: number;
};

export type SystemRow = {
  id: string;
  name: string;
  capacity: string;
  location: string;
  inverter: string;
  status: string;
  uptime: string;
};

export type ContractRow = {
  id: string;
  type: string;
  customer: string;
  term: string;
  pricing: string;
  status: string;
};

export type NotificationRow = {
  id: string;
  title: string;
  body: string;
  time: string;
  tone?: 'default' | 'success' | 'warning';
};

export type NotificationRecord = {
  id: string;
  type?: string;
  title: string;
  body: string;
  entityType?: string | null;
  entityId?: string | null;
  linkHref?: string | null;
  metadata?: Record<string, unknown> | null;
  isRead: boolean;
  readAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NotificationUnreadSummary = {
  unreadCount: number;
};

export type ZaloTemplateType = 'INVOICE' | 'REMINDER' | 'PAID' | 'OTP';

export type ZaloTemplateStatus = {
  configured: boolean;
  idPreview?: string | null;
  source?: 'database' | 'env' | 'default' | 'missing';
};

export type ZaloTemplateSchema = {
  code: 'BILLING_APPROVED' | 'OTP_DEFAULT' | string;
  templateType: 'INVOICE' | 'OTP' | string;
  label: string;
  params: string[];
};

export type ZaloNotificationStatus = {
  configuredForSend: boolean;
  dryRun: boolean;
  apiBaseUrl: string;
  oauthBaseUrl?: string;
  configRecordId?: string | null;
  hasAppId: boolean;
  hasAppSecret: boolean;
  hasAccessToken: boolean;
  hasRefreshToken?: boolean;
  oaIdPreview?: string | null;
  accessTokenFingerprint?: string | null;
  refreshTokenFingerprint?: string | null;
  tokenSourceUsed?: string | null;
  templateIds: {
    INVOICE: ZaloTemplateStatus;
    REMINDER: ZaloTemplateStatus;
    PAID: ZaloTemplateStatus;
    OTP: ZaloTemplateStatus;
  };
  templateInvoiceSchema?: ZaloTemplateSchema | null;
  templateOtpSchema?: ZaloTemplateSchema | null;
  missingRequired: string[];
  missingRecommended: string[];
  accessTokenSource?: 'database' | 'env' | 'default' | 'missing';
  refreshTokenSource?: 'database' | 'env' | 'default' | 'missing';
  appSecretSource?: 'database' | 'env' | 'default' | 'missing';
  tokenSourcePolicy?: 'DATABASE_THEN_ENV_FALLBACK';
  envFallbackInUse?: string[];
  envShadowed?: string[];
  accessTokenState?: 'MISSING' | 'AVAILABLE' | 'EXPIRED' | 'REJECTED';
  accessTokenExpiresAt?: string | null;
  autoRefreshEnabled?: boolean;
  autoRefreshPersistMode?: 'database' | 'env-only' | 'disabled';
  autoRefreshWorking?: boolean | null;
  lastRefreshAt?: string | null;
  lastRefreshStatus?: string | null;
  lastRefreshMessage?: string | null;
  tokenDiagnostics?: {
    status?: string | null;
    tokenSource?: string | null;
    configRecordId?: string | null;
    sendTokenFingerprint?: string | null;
    refreshedTokenFingerprint?: string | null;
    refreshTokenFingerprint?: string | null;
    refreshedAt?: string | null;
    refreshAttempted?: boolean;
    staleTokenDetected?: boolean;
    providerCode?: string | null;
    providerMessage?: string | null;
  } | null;
  latestSendDiagnostics?: {
    tokenSource?: string | null;
    configRecordId?: string | null;
    refreshedTokenFingerprint?: string | null;
    sendTokenFingerprint?: string | null;
    refreshTokenFingerprint?: string | null;
    refreshedAt?: string | null;
    staleTokenDetected?: boolean;
    deliveryChannel?: string | null;
    sendUrl?: string | null;
    authHeaderMode?: string | null;
  } | null;
  lastTokenCheckedAt?: string | null;
  fieldSources?: Partial<
    Record<
      | 'appId'
      | 'appSecret'
      | 'oaId'
      | 'accessToken'
      | 'refreshToken'
      | 'apiBaseUrl'
      | 'oauthBaseUrl'
      | 'templateInvoiceId'
      | 'templateReminderId'
      | 'templatePaidId'
      | 'templateOtpId',
      'database' | 'env' | 'default' | 'missing'
    >
  >;
};

export type ZaloSettingsRecord = ZaloNotificationStatus & {
  provider: string;
  appId?: string | null;
  oaId?: string | null;
  templateInvoiceId?: string | null;
  templateReminderId?: string | null;
  templatePaidId?: string | null;
  templateOtpId?: string | null;
  appSecretPreview?: string | null;
  accessTokenPreview?: string | null;
  refreshTokenPreview?: string | null;
  hasStoredAppSecret?: boolean;
  hasStoredAccessToken?: boolean;
  hasStoredRefreshToken?: boolean;
  recordExists?: boolean;
  lastTestedAt?: string | null;
  lastTestStatus?: string | null;
  lastTestMessage?: string | null;
};

export type ZaloMessageLogRecord = {
  id: string;
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  customerName: string;
  recipientPhone: string;
  templateType: ZaloTemplateType | string;
  templateId?: string | null;
  sendStatus: string;
  providerCode?: string | null;
  providerMessage?: string | null;
  dryRun: boolean;
  createdAt: string;
  requestPayload?: Record<string, unknown> | null;
  responsePayload?: Record<string, unknown> | null;
  debug?: {
    tokenSource?: string | null;
    configRecordId?: string | null;
    refreshedTokenFingerprint?: string | null;
    sendTokenFingerprint?: string | null;
    refreshTokenFingerprint?: string | null;
    refreshedAt?: string | null;
    staleTokenDetected?: boolean;
    deliveryChannel?: string | null;
    sendUrl?: string | null;
    authHeaderMode?: string | null;
  } | null;
};

export type ZaloSendResult = {
  success: boolean;
  dryRun: boolean;
  status: string;
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  customerName: string;
  recipientPhone?: string | null;
  templateType: ZaloTemplateType | string;
  templateId?: string | null;
  providerCode?: string | null;
  providerMessage?: string | null;
  missingRequired?: string[];
  missingRecommended?: string[];
  missingTemplateFields?: string[];
  invalidTemplateFields?: string[];
  logId: string;
  sentAt: string;
  requestPayload?: Record<string, unknown> | null;
  responsePayload?: Record<string, unknown> | null;
  debug?: Record<string, unknown> | null;
};

export type ZaloTestResult = {
  success: boolean;
  dryRun: boolean;
  status: string;
  customerName: string;
  recipientPhone?: string | null;
  templateType: string;
  templateId?: string | null;
  providerCode?: string | null;
  providerMessage?: string | null;
  missingRequired: string[];
  missingRecommended: string[];
  missingTemplateFields?: string[];
  invalidTemplateFields?: string[];
  logId: string;
  sentAt: string;
  requestPayload?: Record<string, unknown> | null;
  responsePayload?: Record<string, unknown> | null;
  debug?: Record<string, unknown> | null;
};

export type FeaturePlugin = {
  id: string;
  key: string;
  name: string;
  description: string;
  category: string;
  version: string;
  installed: boolean;
  enabled: boolean;
  editable: boolean;
  isCore: boolean;
  routePath?: string | null;
  areas: string[];
  sortOrder: number;
  config?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
};

export type ServicePackageRecord = {
  id: string;
  packageCode: string;
  name: string;
  contractType: string;
  shortDescription?: string | null;
  pricePerKwh?: number | null;
  fixedMonthlyFee?: number | null;
  maintenanceFee?: number | null;
  annualEscalationRate?: number | null;
  vatRate?: number | null;
  lateFeeRate?: number | null;
  earlyDiscountRate?: number | null;
  defaultTermMonths?: number | null;
  billingRule?: string | null;
  notes?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type MonitorSnapshot = {
  provider: MonitoringProvider | string;
  sourceMode?: 'LOGIN' | 'DEMO' | string;
  plantId?: string | null;
  plantName?: string | null;
  baseApi?: string | null;
  currentPvKw?: number | null;
  batterySocPct?: number | null;
  batteryPowerKw?: number | null;
  loadPowerKw?: number | null;
  gridImportKw?: number | null;
  gridExportKw?: number | null;
  todayGeneratedKwh?: number | null;
  totalGeneratedKwh?: number | null;
  todayLoadConsumedKwh?: number | null;
  todayGridImportedKwh?: number | null;
  todayGridExportedKwh?: number | null;
  inverterSerial?: string | null;
  inverterStatus?: string | null;
  connectionStatus?: string | null;
  installedPowerKw?: number | null;
  ratedPowerKw?: number | null;
  deviceId?: string | null;
  deviceModel?: string | null;
  deviceType?: string | null;
  todayIncome?: number | null;
  incomeTotal?: number | null;
  co2ReductionTons?: number | null;
  lastRealtimeSyncAt?: string | null;
  lastDailySyncAt?: string | null;
  dataScopes?: Record<string, unknown> | null;
  historyPoints?: Array<{
    time: string;
    generationKwh?: number | null;
    consumptionKwh?: number | null;
    income?: number | null;
  }>;
  daySeries?: Array<{
    recordedAt: string;
    pvPowerKw?: number | null;
    loadPowerKw?: number | null;
    batteryDischargingKw?: number | null;
  }>;
  fetchedAt?: string | null;
  runtimeRecordedAt?: string | null;
  raw?: Record<string, unknown> | null;
};

export type SystemMonitorSyncLogRecord = {
  id: string;
  provider: string;
  syncScope: 'REALTIME' | 'HISTORY' | 'DAY_CLOSE' | string;
  scheduleTier?: 'ACTIVE_VIEW' | 'ONLINE' | 'IDLE' | 'BACKOFF' | string | null;
  status: string;
  message?: string | null;
  errorStatus?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  startedAt: string;
  finishedAt?: string | null;
  createdAt: string;
  context?: Record<string, unknown> | null;
};

export type CustomerSystemMonitor = {
  id: string;
  name: string;
  systemCode: string;
  capacityKwp: number;
  panelCount: number;
  inverterBrand?: string | null;
  inverterModel?: string | null;
  monitoringProvider?: MonitoringProvider | string | null;
  monitoringPlantId?: string | null;
  stationId?: string | null;
  stationName?: string | null;
  timeZone?: string | null;
  latestMonitorSnapshot?: MonitorSnapshot | Record<string, unknown> | null;
  latestMonitorAt?: string | null;
  lastStationSyncAt?: string | null;
  lastRealtimeSyncAt?: string | null;
  lastDailySyncAt?: string | null;
  lastHourlySyncAt?: string | null;
  lastMonthlySyncAt?: string | null;
  lastBillingSyncAt?: string | null;
  lastSyncAttemptAt?: string | null;
  lastSuccessfulSyncAt?: string | null;
  lastSyncStatus?: string | null;
  lastSyncErrorStatus?: string | null;
  lastSyncErrorMessage?: string | null;
  lastSyncErrorAt?: string | null;
  nextRealtimeSyncAt?: string | null;
  nextHistorySyncAt?: string | null;
  monitorBindingReady?: boolean;
  monitorBindingMessage?: string | null;
  latestMonthlySyncTime?: string | null;
  latestMonthlyGenerationKwh?: number | null;
  latestMonthlyBillingAmount?: number | null;
  latestMonthlyBillingMonth?: number | null;
  latestMonthlyBillingYear?: number | null;
  location?: string | null;
  latestOperationalData?: {
    period: string;
    source?: string | null;
    sourceLabel?: string | null;
    sourceKind?: string | null;
    lastUpdatedAt?: string | null;
    lastUpdatedBy?: {
      id: string;
      fullName: string;
      email?: string | null;
    } | null;
    freshness?: {
      code: 'READY' | 'STALE' | 'MISSING';
      label: string;
      isStale: boolean;
      ageDays?: number | null;
      periodLagMonths?: number | null;
    } | null;
  } | null;
  uptime30dPct?: number | null;
  latestAlert?: string | null;
  hasRealtimeData?: boolean;
  hasDailyData?: boolean;
  hasMonthlyData?: boolean;
  hasBillingData?: boolean;
  monitorSyncLogs?: SystemMonitorSyncLogRecord[];
  devices?: DeviceRecord[];
  telemetryRecords?: DeyeTelemetryRecord[];
  dailyRecords?: DeyeDailyRecord[];
  monthlyEnergyRecords?: MonthlyEnergyRecordRecord[];
  monthlyPvBillings?: MonthlyPvBillingRecord[];
  status: string;
};

export type CustomerDashboardData = {
  summary: {
    solarGenerated: number | null;
    loadConsumed: number | null;
    gridImported: number | null;
    gridExported: number | null;
    savings: number;
    outstanding: number;
    invoiceCount: number;
    paymentStatus: string;
    liveSystems?: number;
    currentPvKw?: number | null;
    averageBatterySoc?: number | null;
    hasRealtimeData?: boolean;
    hasDailyData?: boolean;
    hasMonthlyData?: boolean;
    currentBillingAmount?: number;
    currentBillingLabel?: string | null;
    currentBillingPeriod?: string | null;
    currentBillingStatus?: string | null;
    currentBillingVatRate?: number | null;
    outstandingInvoiceCount?: number;
    nearestDueInvoiceNumber?: string | null;
    nearestDueInvoiceDate?: string | null;
    latestDataPeriod?: string | null;
    latestDataSourceLabel?: string | null;
    latestDataStatusLabel?: string | null;
    latestMeterReading?: number | null;
    latestUpdatedAt?: string | null;
    systemsTracked?: number;
    systemsUpdatedCurrentMonth?: number;
  };
  generationTrend: ChartPoint[];
  generationTrendScope?: 'HOURLY' | 'DAILY' | 'MONTHLY' | 'EMPTY';
  generationTrendUnit?: 'kW' | 'kWh';
  generationTrendDescription?: string;
  systems: CustomerSystemMonitor[];
  liveSnapshots: MonitorSnapshot[];
  meterHistory: Array<{
    year: number;
    month: number;
    period: string;
    previousReading: number | null;
    currentReading: number | null;
    loadConsumedKwh: number | null;
    pvGenerationKwh: number;
    amount: number;
    unpaidAmount: number;
    paymentStatus: string;
    updatedAt?: string | null;
    source?: string | null;
    sourceLabel?: string | null;
    systemsCount: number;
  }>;
  syncStatus?: {
    latestUpdatedAt?: string | null;
    sourceLabel?: string | null;
    statusLabel?: string | null;
    statusCode?: 'READY' | 'STALE' | 'MISSING' | string;
  } | null;
  contracts: Array<Record<string, unknown>>;
  invoices: Array<Record<string, unknown>>;
  tickets: Array<Record<string, unknown>>;
};

export type DeyeTelemetryRecord = {
  id: string;
  recordedAt: string;
  generationPowerKw?: number | null;
  consumptionPowerKw?: number | null;
  gridPowerKw?: number | null;
  batterySocPct?: number | null;
  generationValueKwh?: number | null;
  consumptionValueKwh?: number | null;
};

export type DeyeDailyRecord = {
  id: string;
  recordDate: string;
  generationValueKwh?: number | null;
  consumptionValueKwh?: number | null;
  purchaseValueKwh?: number | null;
  gridValueKwh?: number | null;
  batterySocPct?: number | null;
  fullPowerHours?: number | null;
};

export type AdminSystemRecord = {
  id: string;
  systemCode: string;
  name: string;
  systemType?: string | null;
  capacityKwp: number;
  installedCapacityKwp?: number | null;
  panelCount: number;
  inverterBrand?: string | null;
  inverterModel?: string | null;
  monitoringProvider?: MonitoringProvider | string | null;
  monitoringPlantId?: string | null;
  stationId?: string | null;
  stationName?: string | null;
  sourceSystem?: string | null;
  hasBattery?: boolean | null;
  timeZone?: string | null;
  locationAddress?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  gridInterconnectionType?: string | null;
  stationType?: string | null;
  ownerName?: string | null;
  startedAt?: string | null;
  currentMonthGenerationKwh?: number | null;
  currentYearGenerationKwh?: number | null;
  totalGenerationKwh?: number | null;
  currentGenerationPowerKw?: number | null;
  defaultUnitPrice?: number | null;
  defaultVatRate?: number | null;
  defaultTaxAmount?: number | null;
  defaultDiscountAmount?: number | null;
  deyeConnectionId?: string | null;
  solarmanConnectionId?: string | null;
  latestMonitorSnapshot?: MonitorSnapshot | Record<string, unknown> | null;
  latestMonitorAt?: string | null;
  lastStationSyncAt?: string | null;
  lastRealtimeSyncAt?: string | null;
  lastDailySyncAt?: string | null;
  lastHourlySyncAt?: string | null;
  lastMonthlySyncAt?: string | null;
  lastBillingSyncAt?: string | null;
  lastSyncAttemptAt?: string | null;
  lastSuccessfulSyncAt?: string | null;
  lastSyncStatus?: string | null;
  lastSyncErrorStatus?: string | null;
  lastSyncErrorMessage?: string | null;
  lastSyncErrorAt?: string | null;
  nextRealtimeSyncAt?: string | null;
  nextHistorySyncAt?: string | null;
  monitorBindingReady?: boolean;
  monitorBindingMessage?: string | null;
  location?: string | null;
  installDate?: string | null;
  panelBrand?: string | null;
  panelModel?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  customer?: {
    id?: string;
    companyName?: string | null;
    user?: {
      id?: string;
      fullName?: string | null;
      email?: string | null;
    } | null;
  } | null;
  devices?: DeviceRecord[];
  monthlyEnergyRecords?: MonthlyEnergyRecordRecord[];
  monitorSyncLogs?: SystemMonitorSyncLogRecord[];
};

export type ContentPostStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export type ContentPost = {
  id: string;
  title: string;
  slug: string;
  excerpt?: string | null;
  content: string;
  coverImageUrl?: string | null;
  tags: string[];
  status: ContentPostStatus;
  isFeatured: boolean;
  publishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  author: {
    fullName: string;
    email?: string | null;
    role?: {
      code: UserRole;
      name: string;
    } | null;
  };
};

export type InvoiceItemRecord = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
};

export type PaymentRecord = {
  id: string;
  paymentCode: string;
  gateway: string;
  method: string;
  amount: number;
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'REFUNDED';
  paidAt?: string | null;
  customer?: {
    id: string;
    companyName?: string | null;
    user?: {
      id?: string;
      fullName?: string | null;
      email?: string | null;
    } | null;
  } | null;
  proofFileUrl?: string | null;
  proofOriginalName?: string | null;
  proofMimeType?: string | null;
  referenceNote?: string | null;
  reviewNote?: string | null;
  reviewedAt?: string | null;
  reviewedByUser?: {
    id: string;
    fullName: string;
    email?: string | null;
    role?: {
      code: UserRole;
      name: string;
    } | null;
  } | null;
  createdAt: string;
  invoice?: {
    id: string;
    invoiceNumber: string;
    billingMonth: number;
    billingYear: number;
    totalAmount: number;
    paidAmount?: number;
    dueDate?: string;
    status: string;
  } | null;
};

export type ContractRecord = {
  id: string;
  contractNumber: string;
  type: string;
  status: string;
  startDate: string;
  endDate?: string | null;
  termMonths?: number | null;
  pricePerKwh?: number | null;
  fixedMonthlyFee?: number | null;
  interestRate?: number | null;
  vatRate?: number | null;
  contractFileUrl?: string | null;
  servicePackage?: {
    id: string;
    name: string;
    contractType: string;
    pricePerKwh?: number | null;
    fixedMonthlyFee?: number | null;
    maintenanceFee?: number | null;
    vatRate?: number | null;
  } | null;
  solarSystem?: {
    id: string;
    systemCode: string;
    name: string;
    capacityKwp: number;
    location?: string | null;
    inverterBrand?: string | null;
    inverterModel?: string | null;
  } | null;
  customer?: {
    id: string;
    companyName?: string | null;
    user?: {
      fullName?: string | null;
      email?: string | null;
    } | null;
  } | null;
  invoices?: Array<{
    id: string;
    invoiceNumber: string;
    totalAmount: number;
    status: string;
    dueDate: string;
  }>;
};

export type InvoiceRecord = {
  id: string;
  invoiceNumber: string;
  billingMonth: number;
  billingYear: number;
  issuedAt: string;
  dueDate: string;
  subtotal: number;
  vatRate?: number | null;
  vatAmount: number;
  penaltyAmount: number;
  discountAmount: number;
  totalAmount: number;
  paidAmount: number;
  status:
    | 'DRAFT'
    | 'PENDING_REVIEW'
    | 'ISSUED'
    | 'PAID'
    | 'PARTIAL'
    | 'OVERDUE'
    | 'CANCELLED';
  customerId: string;
  contractId: string;
  customer?: {
    id: string;
    companyName?: string | null;
    user?: {
      fullName?: string | null;
      email?: string | null;
    } | null;
  } | null;
  contract?: ContractRecord | null;
  items: InvoiceItemRecord[];
  payments: PaymentRecord[];
  periodMetrics?: {
    period?: string | null;
    pvGenerationKwh?: number | null;
    loadConsumedKwh?: number | null;
    savingsAmount?: number | null;
    previousReading?: number | null;
    currentReading?: number | null;
    source?: string | null;
    sourceLabel?: string | null;
    sourceKind?: string | null;
    syncTime?: string | null;
  } | null;
};

export type MonthlyPvBillingRecord = {
  id: string;
  solarSystemId: string;
  customerId: string;
  contractId?: string | null;
  invoiceId?: string | null;
  month: number;
  year: number;
  pvGenerationKwh: number;
  billableKwh: number;
  unitPrice: number;
  subtotalAmount: number;
  vatRate?: number | null;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  syncStatus:
    | 'PENDING'
    | 'SYNCED'
    | 'RETRYING'
    | 'ERROR'
    | 'MANUAL_OVERRIDE';
  dataQualityStatus:
    | 'UNKNOWN'
    | 'IN_PROGRESS'
    | 'OK'
    | 'INCOMPLETE'
    | 'UNSTABLE_SOURCE'
    | 'ERROR'
    | 'MANUAL_OVERRIDE';
  invoiceStatus:
    | 'ESTIMATE'
    | 'DRAFT'
    | 'PENDING_REVIEW'
    | 'ISSUED'
    | 'PAID'
    | 'PARTIAL'
    | 'OVERDUE'
    | 'CANCELLED';
  expectedDayCount: number;
  availableDayCount: number;
  missingDayCount: number;
  dataSourceStable: boolean;
  autoSendEligible: boolean;
  qualitySummary?: string | null;
  lastAutoRetriedAt?: string | null;
  lastQualityCheckedAt?: string | null;
  finalizedAt?: string | null;
  manualOverrideKwh?: number | null;
  manualOverrideReason?: string | null;
  manualOverrideAt?: string | null;
  manualOverrideByUserId?: string | null;
  syncTime: string;
  source: string;
  note?: string | null;
  createdAt: string;
  updatedAt: string;
  solarSystem?: {
    id: string;
    systemCode: string;
    name: string;
    systemType?: string | null;
    capacityKwp: number;
    location?: string | null;
    status: string;
  } | null;
  customer?: {
    id: string;
    customerCode?: string;
    companyName?: string | null;
    user?: {
      fullName?: string | null;
      email?: string | null;
    } | null;
  } | null;
  contract?: ContractRecord | null;
  manualOverrideByUser?: {
    id: string;
    fullName?: string | null;
    email?: string | null;
  } | null;
  invoice?: InvoiceRecord | null;
  periodMetrics?: {
    period?: string | null;
    pvGenerationKwh?: number | null;
    loadConsumedKwh?: number | null;
    previousReading?: number | null;
    currentReading?: number | null;
    source?: string | null;
    sourceLabel?: string | null;
    sourceKind?: string | null;
    syncTime?: string | null;
  } | null;
};

export type MonthlyEnergyRecordRecord = {
  id: string;
  solarSystemId: string;
  customerId?: string | null;
  deyeConnectionId?: string | null;
  connectionId?: string | null;
  stationId: string;
  year: number;
  month: number;
  pvGenerationKwh: number;
  loadConsumedKwh?: number | null;
  meterReadingStart?: number | null;
  meterReadingEnd?: number | null;
  savingsAmount?: number | null;
  unitPrice: number;
  subtotalAmount: number;
  vatRate?: number | null;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  systemStatusSnapshot?: string | null;
  source: string;
  sourceLabel?: string | null;
  sourceKind?: string | null;
  syncTime: string;
  note?: string | null;
  dataFreshness?: {
    code: 'READY' | 'STALE' | 'MISSING';
    label: string;
    isStale: boolean;
    ageDays?: number | null;
    periodLagMonths?: number | null;
  } | null;
  updatedByUser?: {
    id: string;
    fullName: string;
    email?: string | null;
  } | null;
  rawPayload?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  billing?: {
    id: string;
    invoiceId?: string | null;
    totalAmount: number;
    status: string;
    syncTime?: string | null;
  } | null;
};

export type DeviceRecord = {
  id: string;
  systemId: string;
  connectionId?: string | null;
  stationId: string;
  deviceId?: string | null;
  deviceSn: string;
  deviceType: string;
  productId?: string | null;
  connectStatus?: string | null;
  collectionTime?: number | null;
  externalPayload?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type SolarmanSyncLogRecord = {
  id: string;
  connectionId: string;
  providerType?: string | null;
  action: string;
  status: string;
  errorCode?: string | null;
  message: string;
  context?: Record<string, unknown> | null;
  responsePayload?: Record<string, unknown> | null;
  syncedStations: number;
  syncedMonths: number;
  syncedBillings: number;
  startedAt: string;
  finishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SolarmanStationRecord = {
  stationId: string;
  stationName: string | null;
  sourceSystem?: string | null;
  installedCapacityKw?: number | null;
  generationMonthKwh?: number | null;
  generationYearKwh?: number | null;
  generationTotalKwh?: number | null;
  generationPowerKw?: number | null;
  hasBattery?: boolean | null;
  timezone?: string | null;
  lastUpdateTime?: string | null;
  raw?: Record<string, unknown> | null;
};

export type SolarmanDeviceRecord = {
  deviceId: string;
  serialNumber?: string | null;
  deviceType?: string | null;
  deviceModel?: string | null;
  status?: string | null;
  raw?: Record<string, unknown> | null;
};

export type SolarmanDebugSnapshotRecord = {
  id: string;
  stationId?: string | null;
  deviceSn?: string | null;
  providerType: string;
  snapshotType: string;
  status: string;
  capturedAt?: string | null;
  note?: string | null;
  payload?: Record<string, unknown> | null;
};

export type SolarmanConnectionRecord = {
  id: string;
  accountName: string;
  providerType?: 'OFFICIAL_OPENAPI' | 'COOKIE_SESSION' | 'MANUAL_IMPORT' | string;
  usernameOrEmail: string | null;
  customerId?: string | null;
  defaultUnitPrice?: number | null;
  defaultVatRate?: number | null;
  defaultTaxAmount?: number | null;
  defaultDiscountAmount?: number | null;
  status: string;
  lastSyncTime?: string | null;
  lastSuccessfulSyncAt?: string | null;
  lastErrorCode?: string | null;
  lastErrorMessage?: string | null;
  notes?: string | null;
  accessTokenPreview?: string | null;
  hasStoredPassword?: boolean;
  hasPersistedCookieSession?: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  customer?: CustomerRecord | null;
  systems?: AdminSystemRecord[];
  syncLogs?: SolarmanSyncLogRecord[];
  debugSnapshots?: SolarmanDebugSnapshotRecord[];
  statusSummary?: {
    configured: boolean;
    customerLinked: boolean;
    mappedSystems: number;
    mappedStations: number;
    lastTestStatus?: string | null;
    lastTestMessage?: string | null;
    lastTestAt?: string | null;
    lastSyncStatus?: string | null;
    lastSyncMessage?: string | null;
    lastSyncAt?: string | null;
    lastSuccessfulSyncAt?: string | null;
    lastFailureMessage?: string | null;
    providerType?: string | null;
    authBridgeReady?: boolean;
    lastErrorCode?: string | null;
    lastErrorMessage?: string | null;
    realtimeAvailable: boolean;
    realtimeMessage: string;
  };
};

export type SolarmanSyncStationResult = {
  stationId: string;
  stationName?: string | null;
  systemId?: string | null;
  systemName?: string | null;
  stationSynced: boolean;
  syncedMonths: number;
  syncedBillings: number;
  syncedDailyRecords?: number;
  providerType?: string;
  dailyCoverage?: number;
  monthlyCoverage?: number;
  reason?: string;
};

export type SolarmanTestResponse = {
  connection: SolarmanConnectionRecord;
  stations: SolarmanStationRecord[];
  sampleDevices?: SolarmanDeviceRecord[];
};

export type SolarmanSyncResponse = {
  connection: SolarmanConnectionRecord;
  syncedStations: number;
  syncedMonths: number;
  syncedBillings: number;
  stations: SolarmanSyncStationResult[];
};

export type LuxPowerSyncLogRecord = {
  id: string;
  connectionId: string;
  action: string;
  status: string;
  message: string;
  providerCode?: string | null;
  context?: Record<string, unknown> | null;
  responsePayload?: Record<string, unknown> | null;
  startedAt: string;
  finishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LuxPowerPlantRecord = {
  plantId: string;
  plantName?: string | null;
  createdAt?: string | null;
  raw?: Record<string, unknown> | null;
};

export type LuxPowerInverterRecord = {
  serialNumber: string;
  plantId?: string | null;
  plantName?: string | null;
  model?: string | null;
  deviceType?: string | null;
  statusText?: string | null;
  powerRatingText?: string | null;
  lastUpdateTime?: string | null;
  raw?: Record<string, unknown> | null;
};

export type LuxPowerPlantDetail = {
  plantId?: string | null;
  plantName?: string | null;
  inverterCount: number;
  inverters: LuxPowerInverterRecord[];
  raw?: {
    plant?: Record<string, unknown> | null;
    inverters?: Record<string, unknown>[];
    tree?: Record<string, unknown>[] | null;
  } | null;
};

export type LuxPowerAggregatePoint = {
  periodKey: string;
  year?: number | null;
  month?: number | null;
  day?: number | null;
  inverterOutputKwh?: number | null;
  toUserKwh?: number | null;
  consumptionKwh?: number | null;
  pvGenerationKwh?: number | null;
  gridExportKwh?: number | null;
  batteryChargeKwh?: number | null;
  batteryDischargeKwh?: number | null;
  raw?: Record<string, unknown> | null;
};

export type LuxPowerMonitorSnapshot = {
  provider: 'LUXPOWER';
  sourceMode: 'LOGIN' | 'DEMO';
  plantId?: string | null;
  plantName?: string | null;
  serialNumber?: string | null;
  pvPowerW?: number | null;
  loadPowerW?: number | null;
  gridPowerW?: number | null;
  batteryPowerW?: number | null;
  acCouplePowerW?: number | null;
  currentPvKw?: number | null;
  batterySocPct?: number | null;
  batteryPowerKw?: number | null;
  loadPowerKw?: number | null;
  gridImportKw?: number | null;
  gridExportKw?: number | null;
  todayGenerationKwh?: number | null;
  totalGenerationKwh?: number | null;
  todayChargingKwh?: number | null;
  totalChargingKwh?: number | null;
  todayDischargingKwh?: number | null;
  totalDischargingKwh?: number | null;
  todayExportKwh?: number | null;
  totalExportKwh?: number | null;
  inverterStatus?: string | null;
  fetchedAt: string;
  runtimeRecordedAt?: string | null;
  daySeries?: Array<{
    recordedAt: string;
    pvPowerW?: number | null;
    loadPowerW?: number | null;
    gridPowerW?: number | null;
    batteryPowerW?: number | null;
    batterySocPct?: number | null;
    acCouplePowerW?: number | null;
  }>;
  raw?: {
    runtime?: Record<string, unknown> | null;
    energy?: Record<string, unknown> | null;
    inverter?: Record<string, unknown> | null;
  } | null;
};

export type LuxPowerDebugSnapshotRecord = {
  id: string;
  snapshotType: string;
  status: string;
  providerPlantId?: string | null;
  providerDeviceSn?: string | null;
  capturedAt: string;
  payload?: Record<string, unknown> | null;
  note?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LuxPowerNormalizedMetricRecord = {
  id: string;
  granularity: 'REALTIME' | 'DAILY' | 'MONTHLY' | 'YEARLY' | 'TOTAL';
  periodKey: string;
  metricDate?: string | null;
  year?: number | null;
  month?: number | null;
  pvPowerW?: number | null;
  loadPowerW?: number | null;
  gridPowerW?: number | null;
  batteryPowerW?: number | null;
  batterySocPercent?: number | null;
  acCouplePowerW?: number | null;
  currentPvPowerKw?: number | null;
  currentLoadPowerKw?: number | null;
  currentBatterySoc?: number | null;
  dailyInverterOutputKwh?: number | null;
  dailyToUserKwh?: number | null;
  dailyConsumptionKwh?: number | null;
  monthlyInverterOutputKwh?: number | null;
  monthlyToUserKwh?: number | null;
  monthlyConsumptionKwh?: number | null;
  dailyPvKwh?: number | null;
  monthlyPvKwh?: number | null;
  totalPvKwh?: number | null;
  gridImportKwh?: number | null;
  gridExportKwh?: number | null;
  capturedAt: string;
  rawPayload?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type LuxPowerConnectionRecord = {
  id: string;
  accountName: string;
  username?: string | null;
  plantId?: string | null;
  inverterSerial?: string | null;
  customerId?: string | null;
  solarSystemId?: string | null;
  contractId?: string | null;
  billingRuleLabel?: string | null;
  pollingIntervalMinutes: number;
  useDemoMode: boolean;
  status: string;
  lastLoginAt?: string | null;
  lastSyncTime?: string | null;
  authReadyAt?: string | null;
  plantLinkedAt?: string | null;
  metricsAvailableAt?: string | null;
  billingReadyAt?: string | null;
  lastError?: string | null;
  lastProviderResponse?: Record<string, unknown> | null;
  notes?: string | null;
  hasStoredPassword?: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  customer?: {
    id: string;
    customerCode: string;
    companyName?: string | null;
    user?: {
      id: string;
      fullName: string;
      email?: string | null;
    } | null;
  } | null;
  contract?: {
    id: string;
    contractNumber: string;
    status: string;
    type: string;
    pricePerKwh?: number | null;
    vatRate?: number | null;
    servicePackage?: {
      id: string;
      name: string;
      billingRule?: string | null;
    } | null;
  } | null;
  solarSystem?: AdminSystemRecord | null;
  debugSnapshots?: LuxPowerDebugSnapshotRecord[];
  normalizedMetrics?: LuxPowerNormalizedMetricRecord[];
  syncLogs?: LuxPowerSyncLogRecord[];
  statusSummary?: {
    configured: boolean;
    linkedSystem: boolean;
    linkedCustomer?: boolean;
    linkedContract?: boolean;
    mode: 'LOGIN' | 'DEMO';
    authReady?: boolean;
    plantLinked?: boolean;
    metricsAvailable?: boolean;
    billingReady?: boolean;
    billingSource?: string | null;
    billingSourceLabel?: string | null;
    billingSourceValue?: number | null;
    lastTestStatus?: string | null;
    lastTestMessage?: string | null;
    lastTestAt?: string | null;
    lastSyncStatus?: string | null;
    lastSyncMessage?: string | null;
    lastSyncAt?: string | null;
    lastSuccessfulSyncAt?: string | null;
    lastFailureMessage?: string | null;
    latestMonthlyMetricPeriod?: string | null;
    latestMonthlyMetricSource?: string | null;
    latestMonthlyPvKwh?: number | null;
    missingData?: string[];
  };
};

export type LuxPowerMonthlyBillingPreviewRow = {
  periodKey: string;
  year: number;
  month: number;
  sourceMode: 'AGGREGATED_DAILY' | 'PROVIDER_MONTHLY';
  contractId?: string | null;
  contractNumber?: string | null;
  billingSource?: string | null;
  billingSourceLabel?: string | null;
  sourceValueKwh?: number | null;
  billedPvTotalKwh?: number | null;
  pvGenerationKwh?: number | null;
  loadConsumptionKwh?: number | null;
  gridImportKwh?: number | null;
  gridExportKwh?: number | null;
  batteryChargeKwh?: number | null;
  batteryDischargeKwh?: number | null;
  unitPrice?: number | null;
  subtotalAmount?: number | null;
  taxAmount?: number | null;
  totalAmount?: number | null;
  ready: boolean;
  reasons: string[];
  metric?: Record<string, unknown>;
};

export type LuxPowerBillingAuditRow = {
  periodKey: string;
  year: number;
  month: number;
  rawPvTotal?: number | null;
  normalizedPvTotal?: number | null;
  billedPvTotal?: number | null;
  sourceValueKwh?: number | null;
  billingSource?: string | null;
  billingSourceLabel?: string | null;
  missingDays: number[];
  dayCount: number;
};

export type LuxPowerPipelinePreviewResponse = {
  connection: LuxPowerConnectionRecord;
  sessionMode: 'LOGIN' | 'DEMO';
  warnings: string[];
  plantDetail?: LuxPowerPlantDetail;
  snapshot: LuxPowerMonitorSnapshot;
  rawPayloads?: Record<string, unknown> | null;
  normalized: {
    realtime?: LuxPowerNormalizedMetricRecord | null;
    daily: LuxPowerNormalizedMetricRecord[];
    monthly: LuxPowerNormalizedMetricRecord[];
    total?: LuxPowerNormalizedMetricRecord | null;
  };
  billingPreview: {
    billingSource?: string | null;
    billingSourceLabel?: string | null;
    latestReadyMonth?: string | null;
    rows: LuxPowerMonthlyBillingPreviewRow[];
    auditRows?: LuxPowerBillingAuditRow[];
  };
};

export type LuxPowerTestResponse = {
  connection: LuxPowerConnectionRecord;
  sessionMode: 'LOGIN' | 'DEMO';
  warnings: string[];
  plants: LuxPowerPlantRecord[];
  inverters: LuxPowerInverterRecord[];
  plantDetail?: LuxPowerPlantDetail;
  snapshot: LuxPowerMonitorSnapshot;
  dailyAggregatePoints?: LuxPowerAggregatePoint[];
  monthlyAggregatePoints?: LuxPowerAggregatePoint[];
  lifetimeAggregatePoints?: LuxPowerAggregatePoint[];
};

export type LuxPowerSyncResponse = {
  connection: LuxPowerConnectionRecord;
  sessionMode: 'LOGIN' | 'DEMO';
  systemUpdated: boolean;
  dailySynced?: number;
  monthlySynced?: number;
  billingSynced?: number;
  warnings: string[];
  plantDetail?: LuxPowerPlantDetail;
  snapshot: LuxPowerMonitorSnapshot;
  system?: AdminSystemRecord | null;
};

export type LuxPowerSystemPreviewResponse = {
  connection: {
    id: string;
    accountName: string;
    status: string;
    linkedSystem?: {
      id: string;
      name: string;
      systemCode: string;
      stationId?: string | null;
    } | null;
  };
  snapshot: MonitorSnapshot;
  warnings: string[];
  plantDetail?: LuxPowerPlantDetail;
};

export type LuxPowerSystemSyncResponse = {
  systemId: string;
  systemCode: string;
  provider: 'LUXPOWER';
  snapshot: MonitorSnapshot;
  connectionId: string;
  dailySynced?: number;
  monthlySynced?: number;
  billingSynced?: number;
  warnings: string[];
  system?: AdminSystemRecord | null;
};

export type CustomerRecord = {
  id: string;
  customerCode: string;
  companyName?: string | null;
  installationAddress?: string | null;
  billingAddress?: string | null;
  notes?: string | null;
  defaultUnitPrice?: number | null;
  defaultVatRate?: number | null;
  defaultTaxAmount?: number | null;
  defaultDiscountAmount?: number | null;
  status: CustomerStatus;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    fullName: string;
    email?: string | null;
    phone?: string | null;
    role?: {
      code: UserRole;
      name: string;
    } | null;
  };
  ownerUser?: {
    id: string;
    fullName: string;
    email?: string | null;
    role?: {
      code: UserRole;
      name: string;
    } | null;
  } | null;
  solarSystems?: Array<{
    id: string;
    systemCode: string;
    name: string;
    capacityKwp: number;
    status: string;
    stationId?: string | null;
    stationName?: string | null;
    monitoringProvider?: string | null;
    location?: string | null;
    locationAddress?: string | null;
  }>;
  contracts?: Array<{
    id: string;
    contractNumber: string;
    type: string;
    status: string;
    pricePerKwh?: number | null;
    vatRate?: number | null;
    startDate?: string;
    endDate?: string | null;
    solarSystem?: {
      id: string;
      name: string;
      systemCode?: string | null;
    } | null;
    servicePackage?: {
      id?: string;
      name?: string | null;
    } | null;
  }>;
  invoices?: Array<{
    id: string;
    invoiceNumber: string;
    totalAmount: number;
    status: string;
    createdAt?: string;
    dueDate?: string;
    paidAmount?: number;
    billingMonth?: number;
    billingYear?: number;
  }>;
  supportTickets?: Array<{
    id: string;
    title: string;
    status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
    createdAt?: string;
    updatedAt?: string;
  }>;
};

export type MediaAssetRecord = {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  title?: string | null;
  description?: string | null;
  altText?: string | null;
  tags: string[];
  folder?: string | null;
  fileUrl: string;
  previewUrl: string;
  createdAt: string;
  updatedAt: string;
  uploadedByUser?: {
    id: string;
    fullName: string;
    email?: string | null;
    role?: {
      code: UserRole;
      name: string;
    } | null;
  } | null;
};

export type DeyeSyncLogRecord = {
  id: string;
  source: string;
  connectionId?: string | null;
  syncType: string;
  targetStationId?: string | null;
  status: string;
  message?: string | null;
  startedAt: string;
  finishedAt?: string | null;
  rawPayload?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type DeyeConnectionRecord = {
  id: string;
  accountName: string;
  appId: string;
  email: string;
  baseUrl: string;
  tokenType?: string | null;
  expiresIn?: number | null;
  tokenExpiredAt?: string | null;
  uid?: number | null;
  companyId?: number | null;
  companyName?: string | null;
  roleName?: string | null;
  status: string;
  lastSyncTime?: string | null;
  lastError?: string | null;
  accessTokenPreview?: string | null;
  hasStoredAppSecret?: boolean;
  hasStoredPassword?: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  systems?: AdminSystemRecord[];
  syncLogs?: DeyeSyncLogRecord[];
};

export type DeyeStationPreviewRecord = {
  stationId: string;
  stationName?: string | null;
  installedCapacityKw?: number | null;
  locationAddress?: string | null;
  timezone?: string | null;
  gridInterconnectionType?: string | null;
  stationType?: string | null;
  ownerName?: string | null;
  currentMonthGenerationKwh?: number | null;
  currentYearGenerationKwh?: number | null;
  totalGenerationKwh?: number | null;
  currentGenerationPowerKw?: number | null;
  lastUpdateTime?: string | null;
  deviceCount: number;
  devices: Array<{
    stationId: string;
    deviceId?: string | null;
    deviceSn: string;
    deviceType?: string | null;
    productId?: string | null;
    connectStatus?: string | null;
    collectionTime?: number | null;
  }>;
  linkedSystem?: {
    id: string;
    name: string;
    systemCode: string;
    stationId?: string | null;
  } | null;
};

export type DeyeSystemPreviewResponse = {
  connection: {
    id: string;
    accountName: string;
    companyName?: string | null;
    status: string;
    lastSyncTime?: string | null;
  };
  stations: DeyeStationPreviewRecord[];
};

export type TicketMessageRecord = {
  id: string;
  senderUserId?: string | null;
  senderName: string;
  senderRole: string;
  messageType?: 'MESSAGE' | 'INTERNAL_NOTE' | 'STATUS_CHANGE' | 'ASSIGNMENT' | 'SYSTEM';
  isInternal?: boolean;
  message: string;
  createdAt: string;
  attachments?: TicketAttachmentRecord[];
};

export type TicketAttachmentRecord = {
  id: string;
  ticketId: string;
  messageId?: string | null;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  fileUrl: string;
};

export type TicketParticipantRecord = {
  id: string;
  participantType: 'CUSTOMER' | 'STAFF' | 'WATCHER';
  receiveNotifications?: boolean;
  joinedAt: string;
  user?: {
    id: string;
    fullName?: string | null;
    email?: string | null;
    role?: {
      code: UserRole;
      name: string;
    } | null;
  } | null;
};

export type SupportTicketUnreadSummary = {
  unreadTickets: number;
};

export type PortalRealtimeEvent = {
  type: string;
  data?: Record<string, any> | null;
  timestamp?: string;
};

export type SupportTicketRecord = {
  id: string;
  ticketNumber?: string | null;
  title: string;
  subject?: string;
  description: string;
  category?: 'GENERAL' | 'BILLING' | 'PAYMENT' | 'SYSTEM' | 'MONITORING' | 'MAINTENANCE' | 'CONTRACT' | 'OTHER';
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  createdAt: string;
  updatedAt: string;
  closedAt?: string | null;
  customerLastReadAt?: string | null;
  staffLastReadAt?: string | null;
  unreadForCustomer?: boolean;
  unreadForStaff?: boolean;
  unread?: boolean;
  customer?: {
    id: string;
    customerCode?: string | null;
    companyName?: string | null;
    user?: {
      id?: string;
      fullName?: string | null;
      email?: string | null;
      phone?: string | null;
    } | null;
  } | null;
  solarSystem?: {
    id: string;
    systemCode: string;
    name: string;
    status?: string;
  } | null;
  assigneeUser?: {
    id: string;
    fullName?: string | null;
    email?: string | null;
    role?: {
      code: UserRole;
      name: string;
    } | null;
  } | null;
  participants?: TicketParticipantRecord[];
  attachments?: TicketAttachmentRecord[];
  messages: TicketMessageRecord[];
  lastMessagePreview?: string | null;
  lastMessageAt?: string | null;
};

export type AdminDashboardData = {
  summary: {
    totalCustomers: number;
    totalCapacityKwp: number;
    monthlyRevenue: number;
    yearlyRevenue: number;
    unpaidInvoices: number;
    overdueInvoices: number;
    openTickets: number;
    onTimeRate: number;
    operationalReadySystems?: number;
    operationalStaleSystems?: number;
    operationalMissingSystems?: number;
  };
  revenueTrend: ChartPoint[];
  energyTrend: ChartPoint[];
  topCustomers: Array<{
    customerId: string;
    companyName?: string | null;
    totalBilled: number;
    unpaidBalance: number;
  }>;
  operationalOverview?: Array<{
    systemId: string;
    systemName: string;
    systemCode: string;
    customerName: string;
    latestPeriod?: string | null;
    latestSource?: string | null;
    latestSourceLabel?: string | null;
    latestSourceKind?: string | null;
    latestUpdatedAt?: string | null;
    latestUpdatedBy?: string | null;
    latestPvGenerationKwh?: number | null;
    freshness: {
      code: 'READY' | 'STALE' | 'MISSING';
      label: string;
      isStale: boolean;
      ageDays?: number | null;
      periodLagMonths?: number | null;
    };
  }>;
  ticketSummary: {
    open: number;
    inProgress: number;
    resolved: number;
  };
};

export type OperationalOverviewSystemRow = {
  id: string;
  systemCode: string;
  name: string;
  status: string;
  monitoringProvider?: string | null;
  location?: string | null;
  stationId?: string | null;
  customer?: {
    id: string;
    companyName?: string | null;
    fullName?: string | null;
    email?: string | null;
  } | null;
  latestPeriod?: string | null;
  latestSource?: string | null;
  latestSourceLabel?: string | null;
  latestSourceKind?: string | null;
  latestUpdatedAt?: string | null;
  latestUpdatedBy?: {
    id: string;
    fullName: string;
    email?: string | null;
  } | null;
  latestPvGenerationKwh?: number | null;
  latestLoadConsumedKwh?: number | null;
  latestSavingsAmount?: number | null;
  latestBillingAmount?: number | null;
  latestBillingStatus?: string | null;
  dataFreshness: {
    code: 'READY' | 'STALE' | 'MISSING';
    label: string;
    isStale: boolean;
    ageDays?: number | null;
    periodLagMonths?: number | null;
  };
};

export type OperationalOverviewResponse = {
  summary: {
    totalSystems: number;
    readySystems: number;
    staleSystems: number;
    missingSystems: number;
  };
  systems: OperationalOverviewSystemRow[];
};

export type SystemOperationalRecordsResponse = {
  system: OperationalOverviewSystemRow;
  records: MonthlyEnergyRecordRecord[];
};

export type ImportOperationalDataResponse = {
  sheetName?: string | null;
  totalFiles?: number;
  totalRows: number;
  importedRows: number;
  failedRows: number;
  files?: Array<{
    fileName: string;
    sheetName?: string | null;
    totalRows: number;
    importedRows: number;
    failedRows: number;
    skipped: boolean;
    message?: string | null;
  }>;
  successes: Array<Record<string, unknown>>;
  errors: Array<Record<string, unknown>>;
};
