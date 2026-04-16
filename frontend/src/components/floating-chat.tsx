'use client';

import { usePathname } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  Bot,
  MessageCircleMore,
  PhoneCall,
  Send,
  Sparkles,
  UserRound,
  X,
} from 'lucide-react';
import {
  createContactInquiryRequest,
  featureCatalogRequest,
  websiteAiChatRequest,
} from '@/lib/api';
import { usePublicSiteConfig } from '@/components/public-site-provider';
import { openPublicChat, PublicChatTab } from '@/lib/public-site-events';
import { AiAssistantMessage, FeaturePlugin } from '@/types';

type WebChatMessage = AiAssistantMessage & {
  id: string;
};

const VISITOR_STORAGE_KEY = 'moka_solar_public_visitor_id';

function isPortalPath(pathname: string) {
  return (
    pathname.startsWith('/admin') ||
    pathname.startsWith('/customer') ||
    pathname.startsWith('/portal')
  );
}

function isAuthPath(pathname: string) {
  return pathname === '/login' || pathname === '/register' || pathname === '/forgot-password';
}

function createVisitorId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `visitor-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function FloatingChat() {
  const pathname = usePathname();
  const { siteConfig } = usePublicSiteConfig();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<PublicChatTab>('contact');
  const [visitorId, setVisitorId] = useState('');
  const [catalog, setCatalog] = useState<FeaturePlugin[] | null>(null);
  const [leadForm, setLeadForm] = useState({
    fullName: '',
    phone: '',
    email: '',
    companyName: '',
    message: '',
  });
  const [leadSubmitting, setLeadSubmitting] = useState(false);
  const [leadSuccess, setLeadSuccess] = useState('');
  const [leadError, setLeadError] = useState('');
  const [messages, setMessages] = useState<WebChatMessage[]>([
    {
      id: 'assistant-greeting',
      role: 'assistant',
      content: siteConfig.chat.greeting,
    },
  ]);
  const [draft, setDraft] = useState('');
  const [aiSubmitting, setAiSubmitting] = useState(false);
  const [aiError, setAiError] = useState('');
  const [remainingMessages, setRemainingMessages] = useState(siteConfig.chat.maxFreeMessages);
  const [humanCheckConfirmed, setHumanCheckConfirmed] = useState(false);
  const [leadSuggested, setLeadSuggested] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const existing = window.localStorage.getItem(VISITOR_STORAGE_KEY);
      if (existing) {
        setVisitorId(existing);
        return;
      }

      const nextId = createVisitorId();
      window.localStorage.setItem(VISITOR_STORAGE_KEY, nextId);
      setVisitorId(nextId);
    } catch {
      setVisitorId(createVisitorId());
    }
  }, []);

  useEffect(() => {
    setMessages((current) =>
      current.length === 1 && current[0]?.id === 'assistant-greeting'
        ? [
            {
              id: 'assistant-greeting',
              role: 'assistant',
              content: siteConfig.chat.greeting,
            },
          ]
        : current,
    );
  }, [siteConfig.chat.greeting]);

  useEffect(() => {
    setRemainingMessages((current) =>
      current > 0
        ? Math.min(current, siteConfig.chat.maxFreeMessages)
        : siteConfig.chat.maxFreeMessages,
    );
  }, [siteConfig.chat.maxFreeMessages]);

  useEffect(() => {
    if (isPortalPath(pathname) || isAuthPath(pathname)) {
      return;
    }

    let mounted = true;

    featureCatalogRequest()
      .then((items) => {
        if (mounted) {
          setCatalog(items);
        }
      })
      .catch(() => {
        if (mounted) {
          setCatalog(null);
        }
      });

    return () => {
      mounted = false;
    };
  }, [pathname]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    function handleOpen(event: Event) {
      const customEvent = event as CustomEvent<{ tab?: PublicChatTab; presetMessage?: string }>;
      const nextTab = customEvent.detail?.tab || 'contact';
      const presetMessage = customEvent.detail?.presetMessage?.trim();

      setIsOpen(true);
      setActiveTab(nextTab);

      if (!presetMessage) {
        return;
      }

      if (nextTab === 'ai') {
        setDraft(presetMessage);
        return;
      }

      setLeadForm((current) => ({
        ...current,
        message: current.message || presetMessage,
      }));
    }

    window.addEventListener('moka-public-chat:open', handleOpen as EventListener);
    return () => window.removeEventListener('moka-public-chat:open', handleOpen as EventListener);
  }, []);

  const aiEnabled = useMemo(() => {
    if (!siteConfig.chat.aiEnabled) {
      return false;
    }

    if (!catalog?.length) {
      return true;
    }

    return catalog.some((plugin) => plugin.key === 'website_ai_chat');
  }, [catalog, siteConfig.chat.aiEnabled]);

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') {
      return;
    }

    const html = document.documentElement;
    const body = document.body;
    const previousHtmlOverflow = html.style.overflow;
    const previousBodyOverflow = body.style.overflow;

    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';

    function handleKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    window.addEventListener('keydown', handleKeydown);

    return () => {
      html.style.overflow = previousHtmlOverflow;
      body.style.overflow = previousBodyOverflow;
      window.removeEventListener('keydown', handleKeydown);
    };
  }, [isOpen]);

  if (!siteConfig.chat.enabled || isPortalPath(pathname) || isAuthPath(pathname)) {
    return null;
  }

  async function submitLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLeadSubmitting(true);
    setLeadError('');
    setLeadSuccess('');

    try {
      await createContactInquiryRequest({
        fullName: leadForm.fullName,
        email: leadForm.email || `guest-${(visitorId || 'website').slice(0, 12)}@moka-solar.vn`,
        phone: leadForm.phone || undefined,
        companyName: leadForm.companyName || undefined,
        message:
          leadForm.message ||
          'Khách hàng để lại thông tin từ bong bóng liên hệ nhanh trên website.',
        sourcePage: 'website-chat',
      });

      setLeadSuccess('Đã ghi nhận thông tin. Đội ngũ Moka Solar sẽ liên hệ lại sớm.');
      setLeadForm({
        fullName: '',
        phone: '',
        email: '',
        companyName: '',
        message: '',
      });
    } catch (error) {
      setLeadError(
        error instanceof Error
          ? error.message
          : 'Chưa thể gửi yêu cầu lúc này. Vui lòng thử lại sau ít phút.',
      );
    } finally {
      setLeadSubmitting(false);
    }
  }

  async function submitAiMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!draft.trim() || !visitorId) {
      return;
    }

    if (!humanCheckConfirmed) {
      setAiError('Vui lòng xác nhận bạn đang cần tư vấn thật trước khi gửi câu hỏi.');
      return;
    }

    const userMessage: WebChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: draft.trim(),
    };

    const nextMessages = [...messages, userMessage].slice(-8);

    setMessages(nextMessages);
    setDraft('');
    setAiSubmitting(true);
    setAiError('');

    try {
      const response = await websiteAiChatRequest({
        messages: nextMessages.map(({ role, content }) => ({ role, content })),
        visitorId,
        humanCheckConfirmed,
        pagePath: pathname,
      });

      setMessages((current) => [
        ...current,
        {
          id: response.id,
          role: 'assistant',
          content: response.reply,
        },
      ]);
      setRemainingMessages(response.remainingMessages);
      setLeadSuggested(Boolean(response.leadSuggested));
    } catch (error) {
      setAiError(error instanceof Error ? error.message : 'Trợ lý AI đang bận. Vui lòng thử lại sau.');
    } finally {
      setAiSubmitting(false);
    }
  }

  const sheetWrapperStyle = {
    paddingTop: 'calc(env(safe-area-inset-top) + 0.5rem)',
    paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.5rem)',
  };

  const dialogStyle = {
    maxHeight: 'calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 1rem)',
  };

  const scrollBodyStyle = {
    paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)',
  };

  if (isOpen) {
    return (
      <div className="fixed inset-0 z-[110] flex items-end justify-end p-2 sm:p-5" style={sheetWrapperStyle}>
        <button
          type="button"
          aria-label="Đóng liên hệ nhanh"
          className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        />

        <div
          className="surface-card-strong relative z-10 flex w-full max-w-[400px] flex-col overflow-hidden rounded-[30px] border border-white/12 shadow-[0_36px_100px_rgba(2,6,23,0.68)]"
          style={dialogStyle}
          role="dialog"
          aria-modal="true"
          aria-label="Liên hệ nhanh Moka Solar"
        >
          <div className="shrink-0 border-b border-white/10 bg-slate-950/90 px-4 py-4 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="eyebrow text-slate-400">Liên hệ nhanh</p>
                <h3 className="mt-2 text-lg font-semibold text-white">Moka Solar Concierge</h3>
              </div>
              <button
                type="button"
                className="rounded-full border border-white/10 bg-white/5 p-2.5 text-slate-200 transition hover:bg-white/10"
                onClick={() => setIsOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="shrink-0 border-b border-white/10 px-4 py-3">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('contact')}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  activeTab === 'contact'
                    ? 'bg-white text-slate-950'
                    : 'border border-white/10 bg-white/5 text-slate-200'
                }`}
              >
                Liên hệ trực tiếp
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('ai')}
                disabled={!aiEnabled}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  activeTab === 'ai'
                    ? 'bg-amber-200 text-slate-950'
                    : 'border border-white/10 bg-white/5 text-slate-200'
                } ${!aiEnabled ? 'cursor-not-allowed opacity-50' : ''}`}
              >
                Hỏi trợ lý AI
              </button>
            </div>
          </div>

          {activeTab === 'contact' ? (
            <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4" style={scrollBodyStyle}>
              <div className="rounded-[22px] border border-white/10 bg-white/[0.04] p-4">
                <p className="text-sm leading-7 text-slate-200">{siteConfig.chat.greeting}</p>
                <p className="mt-3 text-xs text-slate-400">{siteConfig.chat.teamAvailabilityLabel}</p>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <a href={siteConfig.contact.hotlineHref} className="btn-dark w-full">
                  <PhoneCall className="mr-2 h-4 w-4" />
                  Gọi ngay
                </a>
                <a href={siteConfig.contact.zaloHref} className="btn-ghost w-full">
                  <MessageCircleMore className="mr-2 h-4 w-4" />
                  Chat Zalo
                </a>
              </div>

              <form className="mt-4 grid gap-3" onSubmit={submitLead}>
                <input
                  className="portal-field"
                  placeholder="Họ và tên"
                  value={leadForm.fullName}
                  onChange={(event) =>
                    setLeadForm((current) => ({ ...current, fullName: event.target.value }))
                  }
                  required
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    className="portal-field"
                    placeholder="Số điện thoại / Zalo"
                    value={leadForm.phone}
                    onChange={(event) =>
                      setLeadForm((current) => ({ ...current, phone: event.target.value }))
                    }
                    required
                  />
                  <input
                    className="portal-field"
                    placeholder="Email (nếu có)"
                    type="email"
                    value={leadForm.email}
                    onChange={(event) =>
                      setLeadForm((current) => ({ ...current, email: event.target.value }))
                    }
                  />
                </div>
                <input
                  className="portal-field"
                  placeholder="Tên doanh nghiệp / công trình"
                  value={leadForm.companyName}
                  onChange={(event) =>
                    setLeadForm((current) => ({ ...current, companyName: event.target.value }))
                  }
                />
                <textarea
                  className="portal-field min-h-[110px]"
                  placeholder="Bạn đang cần tư vấn mô hình nào, mức tiền điện hiện tại ra sao hoặc muốn Moka Solar hỗ trợ điều gì?"
                  value={leadForm.message}
                  onChange={(event) =>
                    setLeadForm((current) => ({ ...current, message: event.target.value }))
                  }
                />

                {leadSuccess ? (
                  <div className="rounded-[18px] border border-emerald-300/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-50">
                    {leadSuccess}
                  </div>
                ) : null}

                {leadError ? (
                  <div className="rounded-[18px] border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-50">
                    {leadError}
                  </div>
                ) : null}

                <button type="submit" className="btn-primary w-full" disabled={leadSubmitting}>
                  {leadSubmitting ? 'Đang gửi yêu cầu...' : 'Để lại thông tin'}
                </button>
              </form>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4" style={scrollBodyStyle}>
              {!aiEnabled ? (
                <div className="rounded-[22px] border border-white/10 bg-white/[0.04] p-4 text-sm leading-7 text-slate-200">
                  Trợ lý AI đang tạm tắt. Bạn có thể chuyển sang liên hệ trực tiếp để được tư vấn.
                </div>
              ) : (
                <>
                  <div className="rounded-[22px] border border-white/10 bg-white/[0.04] p-4">
                    <div className="flex items-start gap-3">
                      <span className="rounded-full border border-amber-300/20 bg-amber-400/10 p-2 text-amber-100">
                        <Bot className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-white">Hỏi nhanh về Moka Solar</p>
                        <p className="mt-1 text-xs leading-6 text-slate-400">
                          Phù hợp để hỏi về bảng giá, mô hình triển khai, cách theo dõi sản lượng hoặc quy trình tư vấn cơ bản.
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-400">
                      <span>{siteConfig.chat.teamAvailabilityLabel}</span>
                      <span>Còn {remainingMessages} lượt hỏi nhanh</span>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {siteConfig.chat.quickPrompts.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        className="metric-pill text-slate-100"
                        onClick={() => setDraft(prompt)}
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>

                  <div className="mt-4 space-y-3">
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className={`rounded-[20px] px-4 py-3 text-sm leading-7 ${
                          message.role === 'assistant'
                            ? 'border border-white/10 bg-white/[0.04] text-slate-200'
                            : 'bg-white text-slate-950'
                        }`}
                      >
                        <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] opacity-70">
                          {message.role === 'assistant' ? (
                            <>
                              <Sparkles className="h-3.5 w-3.5" />
                              Trợ lý AI
                            </>
                          ) : (
                            <>
                              <UserRound className="h-3.5 w-3.5" />
                              Bạn
                            </>
                          )}
                        </div>
                        <p>{message.content}</p>
                      </div>
                    ))}
                  </div>

                  <label className="mt-4 flex items-start gap-3 rounded-[18px] border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-200">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 rounded border-white/20 bg-transparent"
                      checked={humanCheckConfirmed}
                      onChange={(event) => setHumanCheckConfirmed(event.target.checked)}
                    />
                    <span>{siteConfig.chat.humanCheckLabel}</span>
                  </label>

                  <form className="mt-4 grid gap-3" onSubmit={submitAiMessage}>
                    <textarea
                      className="portal-field min-h-[110px]"
                      placeholder="Ví dụ: Tôi muốn biết mô hình nào phù hợp nếu hiện tại tiền điện của tôi khoảng 15 triệu mỗi tháng."
                      value={draft}
                      maxLength={500}
                      onChange={(event) => setDraft(event.target.value)}
                    />

                    {aiError ? (
                      <div className="rounded-[18px] border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-50">
                        {aiError}
                      </div>
                    ) : null}

                    {leadSuggested ? (
                      <div className="rounded-[18px] border border-cyan-300/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-50">
                        {siteConfig.chat.leadPrompt}
                        <button
                          type="button"
                          className="mt-3 block font-semibold underline underline-offset-4"
                          onClick={() => setActiveTab('contact')}
                        >
                          Để lại số điện thoại ngay
                        </button>
                      </div>
                    ) : null}

                    <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                      <button type="submit" className="btn-primary w-full" disabled={aiSubmitting}>
                        {aiSubmitting ? 'Đang gửi câu hỏi...' : 'Gửi câu hỏi'}
                        <Send className="ml-2 h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className="btn-ghost w-full sm:w-auto"
                        onClick={() => setActiveTab('contact')}
                      >
                        Gặp tư vấn viên
                      </button>
                    </div>
                  </form>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-none fixed inset-x-2 bottom-4 z-[110] flex justify-end sm:inset-x-auto sm:bottom-5 sm:right-5">
      <button
        type="button"
        onClick={() => openPublicChat('contact')}
        className="pointer-events-auto group flex items-center gap-3 rounded-full border border-amber-300/20 bg-[linear-gradient(135deg,rgba(255,255,255,0.95),rgba(253,230,138,0.96))] px-4 py-3 text-left shadow-[0_18px_45px_rgba(15,23,42,0.35)] transition hover:-translate-y-0.5"
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-950 text-amber-200">
          <MessageCircleMore className="h-5 w-5" />
        </span>
        <span className="hidden sm:block">
          <span className="block text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
            Liên hệ nhanh
          </span>
          <span className="mt-1 block text-sm font-semibold text-slate-950">
            Gọi, Zalo hoặc để lại thông tin
          </span>
        </span>
      </button>
    </div>
  );
}
