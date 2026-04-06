'use client';

import { FormEvent, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Save, SendHorizonal, ShieldCheck } from 'lucide-react';
import { SectionCard } from '@/components/section-card';
import { StatusPill } from '@/components/status-pill';
import {
  listZaloMessageLogsRequest,
  testZaloConnectionRequest,
  updateZaloNotificationsSettingsRequest,
  zaloNotificationsSettingsRequest,
} from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import { ZaloMessageLogRecord, ZaloSettingsRecord } from '@/types';

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

export default function AdminZaloPage() {
  const [settings, setSettings] = useState<ZaloSettingsRecord | null>(null);
  const [logs, setLogs] = useState<ZaloMessageLogRecord[]>([]);
  const [appId, setAppId] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [oaId, setOaId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [apiBaseUrl, setApiBaseUrl] = useState('');
  const [templateInvoiceId, setTemplateInvoiceId] = useState('');
  const [templateReminderId, setTemplateReminderId] = useState('');
  const [templatePaidId, setTemplatePaidId] = useState('');
  const [testPhone, setTestPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

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
  }

  useEffect(() => {
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
        apiBaseUrl,
        templateInvoiceId,
        templateReminderId,
        templatePaidId,
      });

      setSettings(nextSettings);
      setAppSecret('');
      setAccessToken('');
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
            </div>

            <div className="rounded-[18px] border border-white/8 bg-white/[0.04] px-4 py-4 text-sm leading-6 text-slate-300">
              Secret va token duoc ma hoa o backend. Frontend chi nhan preview da an bot ky tu va
              trang thai cau hinh.
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

                  <button
                    type="button"
                    onClick={() => void handleTestConnection()}
                    disabled={testing}
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
                </div>
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
            '2. Bam "Test ket noi Zalo" de kiem tra missing config va dry-run.',
            '3. Qua /admin/billing de bam "Gui Zalo" cho tung hoa don khi can.',
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
