'use client';

import { FormEvent, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Save, SendHorizonal, ShieldCheck } from 'lucide-react';
import { SectionCard } from '@/components/section-card';
import { StatusPill } from '@/components/status-pill';
import { getSession, hasPermission } from '@/lib/auth';
import {
  listZaloMessageLogsRequest,
  testZaloConnectionRequest,
  updateZaloNotificationsSettingsRequest,
  zaloNotificationsSettingsRequest,
} from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import {
  SessionPayload,
  ZaloMessageLogRecord,
  ZaloSendResult,
  ZaloSettingsRecord,
  ZaloTestResult,
} from '@/types';

function statusTone(status?: string | null) {
  if (!status) {
    return 'default' as const;
  }

  if (status === 'SENT') {
    return 'success' as const;
  }

  if (status === 'FAILED' || status === 'BLOCKED') {
    return 'danger' as const;
  }

  if (status === 'DRY_RUN') {
    return 'warning' as const;
  }

  return 'default' as const;
}

function sourceLabel(source?: string | null) {
  switch (source) {
    case 'database':
      return 'Admin / database';
    case 'env':
      return 'Env fallback';
    case 'default':
      return 'Mặc định hệ thống';
    case 'missing':
      return 'Chưa có';
    default:
      return '-';
  }
}

function tokenStateLabel(state?: string | null) {
  switch (state) {
    case 'AVAILABLE':
      return 'Sẵn sàng';
    case 'EXPIRED':
      return 'Đã hết hạn';
    case 'REJECTED':
      return 'Bị Zalo từ chối';
    case 'MISSING':
      return 'Chưa có token';
    default:
      return '-';
  }
}

function tokenStateTone(state?: string | null) {
  switch (state) {
    case 'AVAILABLE':
      return 'success' as const;
    case 'EXPIRED':
    case 'REJECTED':
      return 'danger' as const;
    case 'MISSING':
      return 'warning' as const;
    default:
      return 'default' as const;
  }
}

function buildZaloValidationMessage(
  result: Pick<
    ZaloTestResult | ZaloSendResult,
    'providerMessage' | 'missingTemplateFields' | 'invalidTemplateFields'
  >,
) {
  const problems = [
    ...(result.missingTemplateFields || []).map((field) => `thieu ${field}`),
    ...(result.invalidTemplateFields || []).map((field) => `${field} khong dung dinh dang`),
  ];

  if (problems.length) {
    return `Khong the gui Zalo: ${problems.join(', ')}.`;
  }

  return result.providerMessage || 'Khong the gui Zalo.';
}

function extractTemplateData(payload?: Record<string, unknown> | null) {
  const templateData = payload?.template_data;
  if (!templateData || typeof templateData !== 'object' || Array.isArray(templateData)) {
    return null;
  }

  return templateData as Record<string, unknown>;
}

function stringifyJsonPreview(value: unknown) {
  if (!value) {
    return null;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return null;
  }
}

export default function AdminZaloPage() {
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [settings, setSettings] = useState<ZaloSettingsRecord | null>(null);
  const [logs, setLogs] = useState<ZaloMessageLogRecord[]>([]);
  const [appId, setAppId] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [oaId, setOaId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [refreshToken, setRefreshToken] = useState('');
  const [apiBaseUrl, setApiBaseUrl] = useState('');
  const [templateInvoiceId, setTemplateInvoiceId] = useState('');
  const [templateReminderId, setTemplateReminderId] = useState('');
  const [templatePaidId, setTemplatePaidId] = useState('');
  const [templateOtpId, setTemplateOtpId] = useState('');
  const [testPhone, setTestPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const canManageSecretSettings = hasPermission(session, 'integration.secrets.manage');
  const canExecuteIntegration = hasPermission(session, 'integrations.execute');
  const latestBillingLog = logs.find(
    (log) => log.templateType === 'INVOICE' || log.templateType === 'TEST',
  );
  const latestBillingTemplatePayload = extractTemplateData(latestBillingLog?.requestPayload);
  const latestBillingTemplatePayloadPreview = stringifyJsonPreview(latestBillingTemplatePayload);
  const latestBillingResponsePreview = stringifyJsonPreview(latestBillingLog?.responsePayload);

  async function loadPage() {
    const [nextSettings, nextLogs] = await Promise.all([
      zaloNotificationsSettingsRequest(),
      listZaloMessageLogsRequest(undefined, 12),
    ]);

    setSettings(nextSettings);
    setLogs(nextLogs);
    setAppId(nextSettings.appId || '');
    setOaId(nextSettings.oaId || '');
    setApiBaseUrl(nextSettings.apiBaseUrl || '');
    setTemplateInvoiceId(nextSettings.templateInvoiceId || '');
    setTemplateReminderId(nextSettings.templateReminderId || '');
    setTemplatePaidId(nextSettings.templatePaidId || '');
    setTemplateOtpId(nextSettings.templateOtpId || '');
  }

  useEffect(() => {
    setSession(getSession());
    loadPage()
      .catch((requestError) =>
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Khong the tai cau hinh Zalo.',
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  async function handleSaveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    setError('');

    try {
      const nextSettings = await updateZaloNotificationsSettingsRequest({
        appId,
        appSecret: appSecret.trim() || undefined,
        oaId,
        accessToken: accessToken.trim() || undefined,
        refreshToken: refreshToken.trim() || undefined,
        apiBaseUrl,
        templateInvoiceId,
        templateReminderId,
        templatePaidId,
        templateOtpId,
      });

      setSettings(nextSettings);
      setAppSecret('');
      setAccessToken('');
      setRefreshToken('');
      setMessage('Da luu cau hinh Zalo tren may chu.');
      await loadPage();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Khong the luu cau hinh Zalo.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleTestConnection() {
    setTesting(true);
    setMessage('');
    setError('');

    try {
      const result = await testZaloConnectionRequest({
        phone: testPhone.trim() || undefined,
      });

      await loadPage();

      if (result.status === 'BLOCKED' || result.status === 'FAILED') {
        setError(buildZaloValidationMessage(result));
        return;
      }

      setMessage(
        result.dryRun
          ? `Zalo test dry-run: ${result.providerMessage || 'He thong dang o che do test-safe.'}`
          : `Da gui test Zalo toi ${result.recipientPhone || 'nguoi nhan test'}.`,
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Khong the test ket noi Zalo.',
      );
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return (
      <SectionCard title="Zalo OA" eyebrow="Cau hinh va test template thong bao" dark>
        <p className="text-sm text-slate-300">Dang tai cau hinh Zalo...</p>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <SectionCard
          title="Cau hinh Zalo OA"
          eyebrow="Thong tin nay chi luu o backend, khong hien secret ra browser"
          dark
        >
          {canManageSecretSettings ? (
            <form onSubmit={handleSaveSettings} className="grid gap-4">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                    App ID
                  </span>
                  <input
                    value={appId}
                    onChange={(event) => setAppId(event.target.value)}
                    className="portal-field"
                    placeholder="Nhap App ID"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                    OA ID
                  </span>
                  <input
                    value={oaId}
                    onChange={(event) => setOaId(event.target.value)}
                    className="portal-field"
                    placeholder="Nhap OA ID"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                    App Secret
                  </span>
                  <input
                    type="password"
                    value={appSecret}
                    onChange={(event) => setAppSecret(event.target.value)}
                    className="portal-field"
                    placeholder="De trong neu muon giu gia tri dang luu"
                  />
                  <span className="text-xs leading-5 text-slate-500">
                    {settings?.hasAppSecret
                      ? `Dang luu: ${settings.appSecretPreview || 'Da cau hinh'}`
                      : 'Chua luu App Secret'}
                  </span>
                </label>

                <label className="grid gap-2">
                  <span className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                    Access Token
                  </span>
                  <input
                    type="password"
                    value={accessToken}
                    onChange={(event) => setAccessToken(event.target.value)}
                    className="portal-field"
                    placeholder="De trong neu muon giu gia tri dang luu"
                  />
                  <span className="text-xs leading-5 text-slate-500">
                    {settings?.hasAccessToken
                      ? `Dang luu: ${settings.accessTokenPreview || 'Da cau hinh'}`
                      : 'Chua luu Access Token'}
                  </span>
                </label>

                <label className="grid gap-2">
                  <span className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                    Refresh Token
                  </span>
                  <input
                    type="password"
                    value={refreshToken}
                    onChange={(event) => setRefreshToken(event.target.value)}
                    className="portal-field"
                    placeholder="De trong neu muon giu gia tri dang luu"
                  />
                  <span className="text-xs leading-5 text-slate-500">
                    {settings?.hasRefreshToken
                      ? `Dang luu: ${settings.refreshTokenPreview || 'Da cau hinh'}`
                      : 'Chua luu Refresh Token'}
                  </span>
                </label>

                <label className="grid gap-2 md:col-span-2">
                  <span className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                    API Base URL
                  </span>
                  <input
                    value={apiBaseUrl}
                    onChange={(event) => setApiBaseUrl(event.target.value)}
                    className="portal-field"
                    placeholder="https://openapi.zalo.me/v3.0/oa"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                    Template ID invoice
                  </span>
                  <input
                    value={templateInvoiceId}
                    onChange={(event) => setTemplateInvoiceId(event.target.value)}
                    className="portal-field"
                    placeholder="Template hoa don"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                    Template ID reminder
                  </span>
                  <input
                    value={templateReminderId}
                    onChange={(event) => setTemplateReminderId(event.target.value)}
                    className="portal-field"
                    placeholder="Template nhac han"
                  />
                </label>

                <label className="grid gap-2 md:col-span-2">
                  <span className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                    Template ID paid
                  </span>
                  <input
                    value={templatePaidId}
                    onChange={(event) => setTemplatePaidId(event.target.value)}
                    className="portal-field"
                    placeholder="Template da thanh toan"
                  />
                </label>

                <label className="grid gap-2 md:col-span-2">
                  <span className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                    Template ID OTP
                  </span>
                  <input
                    value={templateOtpId}
                    onChange={(event) => setTemplateOtpId(event.target.value)}
                    className="portal-field"
                    placeholder="Template OTP dang nhap khach hang"
                  />
                </label>
              </div>

              <div className="rounded-[18px] border border-white/8 bg-white/[0.04] px-4 py-4 text-sm leading-6 text-slate-300">
                Secret va token duoc ma hoa o backend. Frontend chi nhan preview da an bot ky tu va
                trang thai cau hinh. Gui theo so dien thoai se tu dong di qua kenh ZNS; gui theo UID
                se di qua OA template API.
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="btn-primary"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Dang luu...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      Luu cau hinh
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="rounded-[18px] border border-amber-300/15 bg-amber-400/10 px-4 py-4 text-sm leading-6 text-amber-100">
                Tai khoan hien tai co the xem trang thai Zalo va test ket noi, nhung khong duoc xem
                hoac chinh sua secret/token raw.
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-[18px] border border-white/8 bg-white/[0.04] px-4 py-4 text-sm leading-6 text-slate-300">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Template invoice</p>
                  <p className="mt-2 text-base font-semibold text-white">
                    {settings?.templateInvoiceId || 'Chua cau hinh'}
                  </p>
                </div>
                <div className="rounded-[18px] border border-white/8 bg-white/[0.04] px-4 py-4 text-sm leading-6 text-slate-300">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Template reminder</p>
                  <p className="mt-2 text-base font-semibold text-white">
                    {settings?.templateReminderId || 'Chua cau hinh'}
                  </p>
                </div>
                <div className="rounded-[18px] border border-white/8 bg-white/[0.04] px-4 py-4 text-sm leading-6 text-slate-300 md:col-span-2">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">API base URL</p>
                  <p className="mt-2 text-base font-semibold text-white">
                    {settings?.apiBaseUrl || '-'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </SectionCard>

        <div className="space-y-5">
          <SectionCard title="Trang thai ket noi" eyebrow="Kiem tra nhanh truoc khi gui hoa don" dark>
            <div className="grid gap-4">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/[0.06] text-slate-100">
                  <ShieldCheck className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-base font-semibold text-white">
                    {settings?.configuredForSend ? 'San sang gui template' : 'Dang o che do test-safe'}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-slate-400">
                    {settings?.dryRun
                      ? 'Dry-run dang bat. Local test se khong gui tin that.'
                      : 'Live send dang mo neu OA/token/template hop le.'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <StatusPill
                  label={settings?.dryRun ? 'DRY_RUN' : 'SENT'}
                  tone={settings?.dryRun ? 'warning' : 'success'}
                />
                <StatusPill
                  label={settings?.configuredForSend ? 'READY' : 'MISSING_CONFIG'}
                  tone={settings?.configuredForSend ? 'success' : 'danger'}
                />
                <StatusPill
                  label={tokenStateLabel(settings?.accessTokenState)}
                  tone={tokenStateTone(settings?.accessTokenState)}
                />
              </div>

              {settings?.missingRequired?.length ? (
                <div className="rounded-[18px] border border-amber-300/15 bg-amber-400/10 px-4 py-3 text-sm leading-6 text-amber-100">
                  Missing required config: {settings.missingRequired.join(', ')}
                </div>
              ) : null}

              {settings?.missingRecommended?.length ? (
                <div className="rounded-[18px] border border-white/8 bg-white/[0.04] px-4 py-3 text-sm leading-6 text-slate-300">
                  Recommended config chua co: {settings.missingRecommended.join(', ')}
                </div>
              ) : null}

              <div className="rounded-[18px] border border-white/8 bg-white/[0.04] px-4 py-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                  Chan doan token
                </p>
                <div className="mt-3 grid gap-2 text-sm leading-6 text-slate-300 md:grid-cols-2">
                  <p>
                    Access token source:{' '}
                    <span className="font-medium text-white">
                      {sourceLabel(settings?.accessTokenSource)}
                    </span>
                  </p>
                  <p>
                    Refresh token source:{' '}
                    <span className="font-medium text-white">
                      {sourceLabel(settings?.refreshTokenSource)}
                    </span>
                  </p>
                  <p>
                    Trạng thái access token:{' '}
                    <span className="font-medium text-white">
                      {tokenStateLabel(settings?.accessTokenState)}
                    </span>
                  </p>
                  <p>
                    Auto-refresh:{' '}
                    <span className="font-medium text-white">
                      {settings?.autoRefreshEnabled ? 'Đang bật' : 'Chưa sẵn sàng'}
                    </span>
                  </p>
                  <p>
                    Refresh token:{' '}
                    <span className="font-medium text-white">
                      {settings?.hasRefreshToken ? 'Đã cấu hình' : 'Chưa có'}
                    </span>
                  </p>
                  <p>
                    Lưu token sau refresh:{' '}
                    <span className="font-medium text-white">
                      {settings?.autoRefreshPersistMode === 'database'
                        ? 'Ghi lại vào database'
                        : settings?.autoRefreshPersistMode === 'env-only'
                          ? 'Chỉ dùng tạm, env không tự cập nhật'
                          : 'Đang tắt'}
                    </span>
                  </p>
                  <p>
                    App Secret source:{' '}
                    <span className="font-medium text-white">
                      {sourceLabel(settings?.appSecretSource)}
                    </span>
                  </p>
                  <p>
                    Access token hết hạn:{' '}
                    <span className="font-medium text-white">
                      {settings?.accessTokenExpiresAt
                        ? formatDateTime(settings.accessTokenExpiresAt)
                        : 'Chua co thong tin'}
                    </span>
                  </p>
                </div>

                <div className="mt-3 grid gap-2 text-sm leading-6 text-slate-300 md:grid-cols-2">
                  <p>
                    Config record ID:{' '}
                    <span className="font-medium text-white">
                      {settings?.configRecordId || '-'}
                    </span>
                  </p>
                  <p>
                    Current token fingerprint:{' '}
                    <span className="font-medium text-white">
                      {settings?.accessTokenFingerprint || '-'}
                    </span>
                  </p>
                  <p>
                    Refresh token fingerprint:{' '}
                    <span className="font-medium text-white">
                      {settings?.refreshTokenFingerprint || '-'}
                    </span>
                  </p>
                  <p>
                    Token source used:{' '}
                    <span className="font-medium text-white">
                      {settings?.tokenSourceUsed || settings?.accessTokenSource || '-'}
                    </span>
                  </p>
                </div>

                {settings?.lastRefreshAt ? (
                  <div className="mt-3 rounded-[16px] border border-white/8 bg-black/10 px-3 py-3 text-sm leading-6 text-slate-300">
                    <p>
                      Lần refresh gần nhất:{' '}
                      <span className="font-medium text-white">
                        {formatDateTime(settings.lastRefreshAt)}
                      </span>
                    </p>
                    <p>
                      Kết quả refresh:{' '}
                      <span className="font-medium text-white">
                        {settings.lastRefreshStatus || '-'}
                      </span>
                    </p>
                    {settings.lastRefreshMessage ? (
                      <p className="mt-1 text-slate-400">{settings.lastRefreshMessage}</p>
                    ) : null}
                  </div>
                ) : null}

                {settings?.envFallbackInUse?.length ? (
                  <p className="mt-3 text-xs leading-6 text-slate-400">
                    Dang dung env fallback cho: {settings.envFallbackInUse.join(', ')}
                  </p>
                ) : null}

                {settings?.envShadowed?.length ? (
                  <p className="mt-2 text-xs leading-6 text-slate-400">
                    Env co gia tri nhung khong duoc dung vi admin/database dang uu tien cho:{' '}
                    {settings.envShadowed.join(', ')}
                  </p>
                ) : null}

                {settings?.tokenDiagnostics?.refreshedTokenFingerprint ||
                settings?.latestSendDiagnostics?.sendTokenFingerprint ? (
                  <div className="mt-3 rounded-[16px] border border-white/8 bg-black/10 px-3 py-3 text-sm leading-6 text-slate-300">
                    <p>
                      Refreshed token fingerprint:{' '}
                      <span className="font-medium text-white">
                        {settings?.tokenDiagnostics?.refreshedTokenFingerprint ||
                          settings?.latestSendDiagnostics?.refreshedTokenFingerprint ||
                          '-'}
                      </span>
                    </p>
                    <p>
                      Send token fingerprint:{' '}
                      <span className="font-medium text-white">
                        {settings?.tokenDiagnostics?.sendTokenFingerprint ||
                          settings?.latestSendDiagnostics?.sendTokenFingerprint ||
                          '-'}
                      </span>
                    </p>
                    <p>
                      Refreshed at:{' '}
                      <span className="font-medium text-white">
                        {settings?.tokenDiagnostics?.refreshedAt
                          ? formatDateTime(settings.tokenDiagnostics.refreshedAt)
                          : settings?.latestSendDiagnostics?.refreshedAt
                            ? formatDateTime(settings.latestSendDiagnostics.refreshedAt)
                            : '-'}
                      </span>
                    </p>
                    <p>
                      Delivery channel:{' '}
                      <span className="font-medium text-white">
                        {settings?.latestSendDiagnostics?.deliveryChannel || '-'}
                      </span>
                    </p>
                    <p>
                      Send URL:{' '}
                      <span className="font-medium text-white break-all">
                        {settings?.latestSendDiagnostics?.sendUrl || '-'}
                      </span>
                    </p>
                    <p>
                      Auth header:{' '}
                      <span className="font-medium text-white">
                        {settings?.latestSendDiagnostics?.authHeaderMode || '-'}
                      </span>
                    </p>
                    {(settings?.tokenDiagnostics?.staleTokenDetected ||
                      settings?.latestSendDiagnostics?.staleTokenDetected) && (
                      <p className="mt-1 text-rose-300">send flow is using stale token.</p>
                    )}
                  </div>
                ) : null}
              </div>

              <div className="rounded-[18px] border border-white/8 bg-white/[0.04] px-4 py-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                  Test ket noi Zalo
                </p>
                <div className="mt-3 grid gap-3">
                  <label className="grid gap-2">
                    <span className="text-sm text-slate-300">So dien thoai test</span>
                    <input
                      value={testPhone}
                      onChange={(event) => setTestPhone(event.target.value)}
                      className="portal-field"
                      placeholder="Vi du: 0909123456"
                    />
                  </label>
                  <p className="text-xs leading-5 text-slate-500">
                    Khi nhap so dien thoai, he thong se dung luong gui ZNS qua SĐT va tu dong su dung
                    header `access_token`.
                  </p>

                  <button
                    type="button"
                    onClick={() => void handleTestConnection()}
                    disabled={testing || !canExecuteIntegration}
                    className="btn-ghost"
                  >
                    {testing ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Dang test...
                      </>
                    ) : (
                      <>
                        <SendHorizonal className="h-4 w-4" />
                        Test ket noi Zalo
                      </>
                    )}
                  </button>
                  {!canExecuteIntegration ? (
                    <p className="text-xs leading-5 text-slate-500">
                      Tai khoan hien tai chua du quyen test ket noi provider.
                    </p>
                  ) : null}
                </div>
              </div>

              {settings?.lastTestedAt ? (
                <div className="rounded-[18px] border border-white/8 bg-white/[0.04] px-4 py-3 text-sm leading-6 text-slate-300">
                  <p>
                    Lan test gan nhat: <span className="font-medium text-white">{formatDateTime(settings.lastTestedAt)}</span>
                  </p>
                  <p>
                    Ket qua: <span className="font-medium text-white">{settings.lastTestStatus || '-'}</span>
                  </p>
                  {settings.lastTestMessage ? (
                    <p className="mt-1 text-slate-400">{settings.lastTestMessage}</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </SectionCard>
        </div>
      </div>

      {message ? (
        <div className="rounded-[18px] border border-emerald-300/15 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
          {message}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-[18px] border border-rose-300/15 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      ) : null}

      <SectionCard
        title="Billing template hien hanh"
        eyebrow="Preview/test/send billing deu dung chung schema nay"
        dark
      >
        <div className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <div className="space-y-4">
            <div className="rounded-[20px] border border-white/8 bg-white/[0.04] px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                Template dang dung
              </p>
              <p className="mt-2 text-base font-semibold text-white">
                {settings?.templateInvoiceId || 'Chua cau hinh'}
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-400">
                {settings?.templateInvoiceSchema?.label || 'Billing template da duyet'}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {(settings?.templateInvoiceSchema?.params || []).map((param) => (
                  <span
                    key={param}
                    className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs text-slate-200"
                  >
                    {param}
                  </span>
                ))}
              </div>
            </div>

            <div className="rounded-[20px] border border-white/8 bg-white/[0.04] px-4 py-4 text-sm leading-6 text-slate-300">
              <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                Quy tac format
              </p>
              <div className="mt-3 grid gap-2">
                <p>`thang`: hien thi theo ky billing UI, hien tai la `MM/YYYY`</p>
                <p>`san_luong_kwh`: vi du `500 kwh`</p>
                <p>`so_tien`: so tien hien thi cho tin nhan, vi du `1.749.600 đ`</p>
                <p>`transfer_amount`: so nguyen de gan nut chuyen khoan, vi du `1749600`</p>
                <p>`bank_transfer_note`: noi dung chuyen khoan sach, khong them bien cu</p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-[20px] border border-white/8 bg-white/[0.04] px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                Payload preview gan nhat
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Lay tu lan test/gui billing moi nhat de doi chieu voi template da duyet.
              </p>
              {latestBillingTemplatePayloadPreview ? (
                <pre className="mt-4 overflow-x-auto rounded-[16px] border border-white/8 bg-black/20 px-4 py-4 text-xs leading-6 text-slate-200">
                  {latestBillingTemplatePayloadPreview}
                </pre>
              ) : (
                <p className="mt-4 text-sm leading-6 text-slate-300">
                  Chua co payload preview. Hay bam `Test ket noi Zalo` hoac gui mot invoice dry-run
                  de xem du lieu mau moi nhat.
                </p>
              )}
            </div>

            <div className="rounded-[20px] border border-white/8 bg-white/[0.04] px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                Provider response gan nhat
              </p>
              {latestBillingResponsePreview ? (
                <pre className="mt-4 overflow-x-auto rounded-[16px] border border-white/8 bg-black/20 px-4 py-4 text-xs leading-6 text-slate-200">
                  {latestBillingResponsePreview}
                </pre>
              ) : (
                <p className="mt-4 text-sm leading-6 text-slate-300">
                  Chua co response preview tu provider.
                </p>
              )}
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Nhat ky gui Zalo" eyebrow="Moi lan test hoac gui hoa don deu duoc luu lai" dark>
        <div className="grid gap-3">
          {logs.length ? (
            logs.map((log) => (
              <div
                key={log.id}
                className="rounded-[20px] border border-white/8 bg-white/[0.04] px-4 py-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {log.invoiceNumber || log.customerName}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {log.recipientPhone || '-'} · {formatDateTime(log.createdAt)}
                    </p>
                  </div>
                  <StatusPill label={log.sendStatus} tone={statusTone(log.sendStatus)} />
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-300">
                  {log.providerMessage || 'Khong co thong diep tra ve tu provider.'}
                </p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                  <span>Template: {log.templateType}</span>
                  <span>Template ID: {log.templateId || '-'}</span>
                  <span>{log.dryRun ? 'Dry run' : 'Live send'}</span>
                  <span>Token source: {log.debug?.tokenSource || '-'}</span>
                  <span>Send fp: {log.debug?.sendTokenFingerprint || '-'}</span>
                  <span>Channel: {log.debug?.deliveryChannel || '-'}</span>
                </div>
                {log.debug?.refreshedTokenFingerprint || log.debug?.staleTokenDetected ? (
                  <div className="mt-2 text-xs leading-5 text-slate-400">
                    <p>Refreshed fp: {log.debug?.refreshedTokenFingerprint || '-'}</p>
                    {log.debug?.sendUrl ? <p>Send URL: {log.debug.sendUrl}</p> : null}
                    {log.debug?.authHeaderMode ? <p>Auth header: {log.debug.authHeaderMode}</p> : null}
                    {log.debug?.refreshedAt ? (
                      <p>Refreshed at: {formatDateTime(log.debug.refreshedAt)}</p>
                    ) : null}
                    {log.debug?.staleTokenDetected ? (
                      <p className="text-rose-300">send flow is using stale token.</p>
                    ) : null}
                  </div>
                ) : null}
                {log.requestPayload || log.responsePayload ? (
                  <details className="mt-3 rounded-[16px] border border-white/8 bg-black/10 px-3 py-3 text-xs text-slate-300">
                    <summary className="cursor-pointer select-none text-slate-200">
                      Xem payload va response
                    </summary>
                    {log.requestPayload ? (
                      <div className="mt-3">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                          Payload gui di
                        </p>
                        <pre className="mt-2 overflow-x-auto rounded-[12px] border border-white/8 bg-black/20 px-3 py-3 leading-6 text-slate-200">
                          {stringifyJsonPreview(log.requestPayload)}
                        </pre>
                      </div>
                    ) : null}
                    {log.responsePayload ? (
                      <div className="mt-3">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                          Response tu Zalo
                        </p>
                        <pre className="mt-2 overflow-x-auto rounded-[12px] border border-white/8 bg-black/20 px-3 py-3 leading-6 text-slate-200">
                          {stringifyJsonPreview(log.responsePayload)}
                        </pre>
                      </div>
                    ) : null}
                  </details>
                ) : null}
              </div>
            ))
          ) : (
            <div className="rounded-[20px] border border-white/8 bg-white/[0.04] px-4 py-4 text-sm leading-6 text-slate-300">
              Chua co log gui Zalo nao. Sau khi test ket noi hoac bam "Gui Zalo" tai billing, ket qua
              se xuat hien tai day.
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Luong su dung" eyebrow="Admin settings va billing dung chung mot backend service" dark>
        <div className="grid gap-3 md:grid-cols-3">
          {[
            '1. Luu App ID, secret, OA ID, token va template IDs tai day.',
            '2. Bam "Test ket noi Zalo" de xem preview payload theo dung template billing dang active.',
            '3. Qua /admin/billing de bam "Gui Zalo"; he thong se dung cung schema va validation nay.',
          ].map((item) => (
            <div key={item} className="rounded-[20px] border border-white/8 bg-white/[0.04] px-4 py-4 text-sm leading-6 text-slate-300">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-4.5 w-4.5 text-slate-200" />
                <p>{item}</p>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
