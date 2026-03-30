'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  Bot,
  CheckCircle2,
  FileDown,
  KeyRound,
  Loader2,
  Save,
  SendHorizonal,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { SectionCard } from '@/components/section-card';
import {
  aiAssistantSettingsRequest,
  aiAssistantStatusRequest,
  applyAiActionRequest,
  generateInvoiceReminderDraftsRequest,
  listAiActionDraftsRequest,
  runAiActionRequest,
  saveAiActionDraftRequest,
  updateAiAssistantSettingsRequest,
} from '@/lib/api';
import { cn, formatDateTime } from '@/lib/utils';
import { AiActionDraftRecord, AiAssistantSettingsPayload, AiAssistantStatus } from '@/types';

const defaultModel = 'gpt-5.4-mini';

const actionOptions = [
  { value: 'WRITE_ARTICLE', label: 'Viet bai', targetType: 'CONTENT_POST' },
  { value: 'EDIT_CONTENT', label: 'Sua noi dung', targetType: 'CONTENT_POST' },
  { value: 'GENERATE_FAQ', label: 'Tao FAQ', targetType: 'CONTENT_POST' },
  { value: 'INVOICE_REMINDER', label: 'Soan nhac hoa don', targetType: 'INVOICE_REMINDER' },
  { value: 'CUSTOMER_MESSAGE', label: 'Soan tin nhan', targetType: 'CONTENT_POST' },
] as const;

function buildStatusSourceLabel(status: AiAssistantStatus | null) {
  if (!status) {
    return 'Chua co du lieu';
  }

  if (status.source === 'database') {
    return 'Da luu trong admin';
  }

  if (status.source === 'env') {
    return 'Doc tu bien moi truong';
  }

  return 'Chua cau hinh';
}

export default function AdminAiPage() {
  const [status, setStatus] = useState<AiAssistantStatus | null>(null);
  const [drafts, setDrafts] = useState<AiActionDraftRecord[]>([]);
  const [actionType, setActionType] = useState<(typeof actionOptions)[number]['value']>('WRITE_ARTICLE');
  const [title, setTitle] = useState('');
  const [instruction, setInstruction] = useState('');
  const [context, setContext] = useState('');
  const [targetType, setTargetType] = useState('CONTENT_POST');
  const [resultTitle, setResultTitle] = useState('');
  const [resultContent, setResultContent] = useState('');
  const [selectedDraftId, setSelectedDraftId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(defaultModel);
  const [loading, setLoading] = useState(true);
  const [runningAction, setRunningAction] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [applyingAction, setApplyingAction] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [generatingReminders, setGeneratingReminders] = useState(false);
  const [reminderMonth, setReminderMonth] = useState(String(new Date().getMonth() + 1));
  const [reminderYear, setReminderYear] = useState(String(new Date().getFullYear()));
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const canRunAction = useMemo(
    () => Boolean(instruction.trim()) && Boolean(status?.configured) && !runningAction,
    [instruction, runningAction, status],
  );

  async function loadScreen() {
    const [statusResponse, settingsResponse, draftsResponse] = await Promise.all([
      aiAssistantStatusRequest(),
      aiAssistantSettingsRequest(),
      listAiActionDraftsRequest(),
    ]);

    const mergedStatus = settingsResponse || statusResponse;
    setStatus(mergedStatus);
    setModel(mergedStatus.model || defaultModel);
    setDrafts(draftsResponse);
  }

  useEffect(() => {
    loadScreen()
      .catch((requestError) =>
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Khong the tai trang thai AI admin.',
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  function syncTargetWithAction(nextActionType: string) {
    const nextTargetType =
      actionOptions.find((option) => option.value === nextActionType)?.targetType || 'CONTENT_POST';
    setActionType(nextActionType as (typeof actionOptions)[number]['value']);
    setTargetType(nextTargetType);
  }

  async function handleRunAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canRunAction) {
      return;
    }

    setRunningAction(true);
    setError('');
    setMessage('');

    try {
      const response = await runAiActionRequest({
        actionType,
        title: title.trim() || undefined,
        instruction: instruction.trim(),
        context: context.trim() || undefined,
        targetType,
      });

      setResultTitle(response.title);
      setResultContent(response.content);
      setTargetType(response.suggestedTargetType || targetType);
      setSelectedDraftId('');
      setMessage('Da tao noi dung AI. Ban co the chen vao editor, luu nhap hoac ap dung ngay.');
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Khong the tao noi dung tu AI.',
      );
    } finally {
      setRunningAction(false);
    }
  }

  async function handleSaveDraft() {
    if (!resultTitle.trim() || !resultContent.trim()) {
      setError('Chua co noi dung de luu nhap.');
      return;
    }

    setSavingDraft(true);
    setError('');
    setMessage('');

    try {
      const draft = await saveAiActionDraftRequest({
        actionType,
        title: resultTitle.trim(),
        prompt: instruction.trim() || undefined,
        content: resultContent.trim(),
        targetType,
      });

      setSelectedDraftId(draft.id);
      await loadScreen();
      setMessage('Da luu nhap AI vao he thong.');
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Khong the luu nhap AI.',
      );
    } finally {
      setSavingDraft(false);
    }
  }

  async function handleApplyNow() {
    if (!resultTitle.trim() || !resultContent.trim()) {
      setError('Chua co noi dung de ap dung.');
      return;
    }

    setApplyingAction(true);
    setError('');
    setMessage('');

    try {
      const response = await applyAiActionRequest({
        draftId: selectedDraftId || undefined,
        actionType,
        title: resultTitle.trim(),
        content: resultContent.trim(),
        targetType,
      });

      await loadScreen();
      setMessage(
        response.targetType === 'CONTENT_POST'
          ? 'Da tao bai viet nhap tu ket qua AI.'
          : 'Da chuyen ket qua thanh draft nhac hoa don san sang dung tiep.',
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Khong the ap dung ket qua AI.',
      );
    } finally {
      setApplyingAction(false);
    }
  }

  async function handleGenerateReminders() {
    setGeneratingReminders(true);
    setError('');
    setMessage('');

    try {
      const nextDrafts = await generateInvoiceReminderDraftsRequest({
        billingMonth: Number(reminderMonth),
        billingYear: Number(reminderYear),
        templateType: 'ALL',
      });

      setDrafts(nextDrafts.concat(drafts).slice(0, 40));
      setMessage(`Da tao ${nextDrafts.length} draft nhac thanh toan cho ky da chon.`);
      await loadScreen();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Khong the tao draft nhac thanh toan.',
      );
    } finally {
      setGeneratingReminders(false);
    }
  }

  async function handleSaveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const payload: AiAssistantSettingsPayload = {
      model: model.trim(),
    };

    if (apiKey.trim()) {
      payload.apiKey = apiKey.trim();
    }

    setSavingSettings(true);
    setError('');
    setMessage('');

    try {
      await updateAiAssistantSettingsRequest(payload);
      await loadScreen();
      setApiKey('');
      setMessage('Da luu cau hinh ChatGPT tren may chu.');
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Khong the luu cau hinh AI.',
      );
    } finally {
      setSavingSettings(false);
    }
  }

  function loadDraftIntoEditor(draft: AiActionDraftRecord) {
    setSelectedDraftId(draft.id);
    setActionType(draft.actionType as (typeof actionOptions)[number]['value']);
    setTargetType(draft.targetType || 'CONTENT_POST');
    setResultTitle(draft.title);
    setResultContent(draft.content);
    setInstruction(draft.prompt || '');
    setMessage(`Da nap nhap "${draft.title}" vao editor.`);
    setError('');
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_380px]">
        <SectionCard title="AI workflow" eyebrow="Viet bai, sua noi dung, FAQ va nhac hoa don" dark>
          <div className="grid gap-4">
            <form
              onSubmit={handleRunAction}
              className="rounded-[24px] border border-white/10 bg-slate-950/35 p-4"
            >
              <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)]">
                <label className="grid gap-2">
                  <span className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                    Tac vu AI
                  </span>
                  <select
                    value={actionType}
                    onChange={(event) => syncTargetWithAction(event.target.value)}
                    className="portal-field"
                  >
                    {actionOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-2">
                  <span className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                    Tieu de / nhiem vu
                  </span>
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    className="portal-field"
                    placeholder="Vi du: Bai gioi thieu mo hinh PPA cho doanh nghiep"
                  />
                </label>

                <label className="grid gap-2 xl:col-span-2">
                  <span className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                    Yeu cau chinh
                  </span>
                  <textarea
                    value={instruction}
                    onChange={(event) => setInstruction(event.target.value)}
                    rows={5}
                    className="portal-field min-h-[150px]"
                    placeholder="Mo ta ro dau viec can AI xu ly, ket qua mong muon va giong dieu can dung."
                  />
                </label>

                <label className="grid gap-2 xl:col-span-2">
                  <span className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                    Boi canh bo sung
                  </span>
                  <textarea
                    value={context}
                    onChange={(event) => setContext(event.target.value)}
                    rows={4}
                    className="portal-field min-h-[120px]"
                    placeholder="Them thong tin ve doi tuong khach hang, ky hoa don, tone thuong hieu, hoac noi dung can dua vao."
                  />
                </label>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="submit"
                  disabled={!canRunAction}
                  className={cn('btn-primary', !canRunAction && 'cursor-not-allowed opacity-60')}
                >
                  {runningAction ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Dang tao noi dung...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Tao bang AI
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setResultTitle(title.trim());
                    setMessage('Da chen noi dung vao editor de tiep tuc chinh tay.');
                  }}
                  className="btn-ghost"
                >
                  <Wand2 className="h-4 w-4" />
                  Chen vao editor
                </button>
              </div>
            </form>

            <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">Editor ket qua</p>
                  <p className="mt-1 text-xs leading-5 text-slate-400">
                    Khu vuc nay dung de review, sua nhanh, luu nhap hoac ap dung ngay.
                  </p>
                </div>
                <span className="rounded-full border border-white/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-200">
                  Dich den: {targetType}
                </span>
              </div>

              <div className="mt-4 grid gap-3">
                <label className="grid gap-2">
                  <span className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                    Tieu de ket qua
                  </span>
                  <input
                    value={resultTitle}
                    onChange={(event) => setResultTitle(event.target.value)}
                    className="portal-field"
                    placeholder="Tieu de se duoc luu vao draft/ap dung"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                    Noi dung
                  </span>
                  <textarea
                    value={resultContent}
                    onChange={(event) => setResultContent(event.target.value)}
                    rows={12}
                    className="portal-field min-h-[320px]"
                    placeholder="Ket qua AI se hien o day."
                  />
                </label>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void handleSaveDraft()}
                  disabled={savingDraft}
                  className={cn('btn-ghost', savingDraft && 'cursor-not-allowed opacity-60')}
                >
                  <Save className="h-4 w-4" />
                  {savingDraft ? 'Dang luu...' : 'Luu nhap'}
                </button>

                <button
                  type="button"
                  onClick={() => void handleApplyNow()}
                  disabled={applyingAction}
                  className={cn('btn-primary', applyingAction && 'cursor-not-allowed opacity-60')}
                >
                  <SendHorizonal className="h-4 w-4" />
                  {applyingAction ? 'Dang ap dung...' : 'Ap dung ngay'}
                </button>
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
          </div>
        </SectionCard>

        <div className="space-y-5">
          <SectionCard title="Cau hinh ChatGPT" eyebrow="API key va model" dark>
            <form onSubmit={handleSaveSettings} className="grid gap-4">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/[0.06] text-slate-100">
                  <KeyRound className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">
                    {loading
                      ? 'Dang kiem tra cau hinh'
                      : status?.configured
                        ? `Da ket noi ${status.provider.toUpperCase()}`
                        : 'Chua cau hinh API key'}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-400">
                    {buildStatusSourceLabel(status)}
                    {status?.updatedAt ? ` - cap nhat ${formatDateTime(status.updatedAt)}` : ''}
                  </p>
                </div>
              </div>

              <label className="grid gap-2">
                <span className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                  OpenAI API key
                </span>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  className="portal-field"
                  placeholder="sk-..."
                />
              </label>

              <label className="grid gap-2">
                <span className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                  Model
                </span>
                <input
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  className="portal-field"
                />
              </label>

              <button
                type="submit"
                disabled={savingSettings}
                className={cn('btn-primary', savingSettings && 'cursor-not-allowed opacity-60')}
              >
                {savingSettings ? 'Dang luu...' : 'Luu cau hinh'}
              </button>
            </form>
          </SectionCard>

          <SectionCard title="Nhac thanh toan tu dong" eyebrow="Tao draft theo trang thai hoa don" dark>
            <div className="grid gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                    Thang
                  </span>
                  <input
                    value={reminderMonth}
                    onChange={(event) => setReminderMonth(event.target.value)}
                    className="portal-field"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                    Nam
                  </span>
                  <input
                    value={reminderYear}
                    onChange={(event) => setReminderYear(event.target.value)}
                    className="portal-field"
                  />
                </label>
              </div>

              <div className="rounded-[18px] border border-white/8 bg-white/[0.04] px-4 py-4 text-sm leading-6 text-slate-300">
                Tao san draft theo 3 nhom: sap den han, den han va qua han. Draft duoc luu de doi
                van hanh review truoc khi gui Zalo/email sau nay.
              </div>

              <button
                type="button"
                onClick={() => void handleGenerateReminders()}
                disabled={generatingReminders}
                className={cn('btn-ghost', generatingReminders && 'cursor-not-allowed opacity-60')}
              >
                {generatingReminders ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Dang tao draft...
                  </>
                ) : (
                  <>
                    <FileDown className="h-4 w-4" />
                    Tao draft nhac hoa don
                  </>
                )}
              </button>
            </div>
          </SectionCard>

          <SectionCard title="Nhanh de su dung" eyebrow="Action san co" dark>
            <div className="space-y-3 text-sm text-slate-300">
              {[
                'Viet bai website va tao ngay post draft trong admin.',
                'Sua noi dung/FAQ roi luu nhap de doi ngu duyet tiep.',
                'Soan nhac hoa don hang loat theo trang thai va ky hoa don.',
                'Tao tin nhan Zalo/email tu 1 editor chung, khong can copy chat thu cong.',
              ].map((item) => (
                <div key={item} className="portal-card-soft rounded-[22px] p-4">
                  <div className="flex items-start gap-3">
                    <Bot className="mt-0.5 h-4.5 w-4.5 text-slate-300" />
                    <p className="leading-6">{item}</p>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>

      <SectionCard title="Draft AI gan day" eyebrow="Nap lai vao editor, review va ap dung" dark>
        <div className="space-y-3">
          {drafts.length ? (
            drafts.map((draft) => (
              <div key={draft.id} className="portal-card-soft p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                      {draft.actionType} - {draft.status}
                    </p>
                    <h3 className="mt-2 text-lg font-semibold text-white">{draft.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-300 line-clamp-3">
                      {draft.content}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">
                      Cap nhat {formatDateTime(draft.updatedAt)}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => loadDraftIntoEditor(draft)}
                    className="btn-ghost"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Nap vao editor
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="portal-card-soft p-5">
              <p className="text-base font-semibold text-white">Chua co draft AI nao</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Chay mot tac vu AI hoac tao draft nhac hoa don de bat dau quy trinh moi.
              </p>
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
