'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { SectionCard } from '@/components/section-card';
import {
  buildDefaultMarketingPages,
  normalizeMarketingPages,
} from '@/data/marketing-cms';
import {
  listMarketingPagesRequest,
  updateMarketingPageRequest,
} from '@/lib/api';
import {
  AboutPageContent,
  ContactPageContent,
  HomePageContent,
  MarketingLocale,
  MarketingPageKey,
  MarketingPageRecord,
  PricingPageContent,
  SolutionsPageContent,
} from '@/types';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function linesToArray(value: string) {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

function arrayToLines(value: string[]) {
  return value.join('\n');
}

function TextField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-xs uppercase tracking-[0.22em] text-slate-400">{props.label}</span>
      <input
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={props.placeholder}
        className="rounded-[18px] border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-emerald-300/40"
      />
    </label>
  );
}

function TextAreaField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-xs uppercase tracking-[0.22em] text-slate-400">{props.label}</span>
      <textarea
        value={props.value}
        rows={props.rows || 4}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={props.placeholder}
        className="rounded-[18px] border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-emerald-300/40"
      />
    </label>
  );
}

function EditorHeader(props: {
  page: MarketingPageRecord;
  selectedKey: MarketingPageKey;
  selectedLocale: MarketingLocale;
  onSelectKey: (value: MarketingPageKey) => void;
  onSelectLocale: (value: MarketingLocale) => void;
  onTogglePublished: (value: boolean) => void;
  onChangeName: (value: string) => void;
  onChangeDescription: (value: string) => void;
  onSave: () => Promise<void>;
  saving: boolean;
  message: string;
  error: string;
}) {
  const pageOptions: Array<{ key: MarketingPageKey; label: string; href: string }> = [
    { key: 'home', label: 'Trang chủ', href: '/' },
    { key: 'about', label: 'Giới thiệu', href: '/about' },
    { key: 'solutions', label: 'Giải pháp', href: '/solutions' },
    { key: 'contact', label: 'Liên hệ', href: '/contact' },
    { key: 'pricing', label: 'Bảng giá', href: '/pricing' },
  ];

  return (
    <SectionCard title="CMS website" eyebrow="Biên tập trang public" dark>
      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-3">
            {pageOptions.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => props.onSelectKey(option.key)}
                className={`rounded-[22px] border px-4 py-4 text-left transition ${
                  props.selectedKey === option.key
                    ? 'border-white/20 bg-white text-slate-950'
                    : 'border-white/10 bg-white/5 text-white hover:bg-white/10'
                }`}
              >
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Trang</p>
                <p className="mt-2 text-lg font-semibold">{option.label}</p>
                <p className="mt-2 text-xs text-slate-500">{option.href}</p>
              </button>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Tên hiển thị trong admin" value={props.page.name} onChange={props.onChangeName} />
            <label className="grid gap-2">
              <span className="text-xs uppercase tracking-[0.22em] text-slate-400">Trạng thái public</span>
              <button
                type="button"
                onClick={() => props.onTogglePublished(!props.page.published)}
                className={`rounded-[18px] border px-4 py-3 text-left text-sm font-semibold transition ${
                  props.page.published
                    ? 'border-emerald-300/30 bg-emerald-400/10 text-emerald-100'
                    : 'border-amber-300/30 bg-amber-400/10 text-amber-100'
                }`}
              >
                {props.page.published ? 'Đang public' : 'Đang ẩn'}
              </button>
            </label>
          </div>

          <TextAreaField
            label="Mô tả trang trong admin"
            value={props.page.description || ''}
            onChange={props.onChangeDescription}
            rows={3}
          />
        </div>

        <div className="grid gap-4">
          <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs uppercase tracking-[0.22em] text-slate-400">Ngôn ngữ đang sửa</span>
              {(['vi', 'en'] as MarketingLocale[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => props.onSelectLocale(option)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                    props.selectedLocale === option
                      ? 'bg-white text-slate-950'
                      : 'bg-white/5 text-slate-200 hover:bg-white/10'
                  }`}
                >
                  {option.toUpperCase()}
                </button>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <Link href={props.selectedKey === 'home' ? '/' : `/${props.selectedKey}`} className="btn-ghost">
                Mở trang public
              </Link>
              <button type="button" className="btn-primary" onClick={() => void props.onSave()} disabled={props.saving}>
                {props.saving ? 'Đang lưu...' : 'Lưu nội dung'}
              </button>
            </div>
          </div>

          {props.message ? (
            <div className="rounded-[22px] border border-emerald-300/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
              {props.message}
            </div>
          ) : null}
          {props.error ? (
            <div className="rounded-[22px] border border-rose-300/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
              {props.error}
            </div>
          ) : null}
        </div>
      </div>
    </SectionCard>
  );
}

function HomeEditor(props: {
  content: HomePageContent;
  update: (mutator: (content: HomePageContent) => void) => void;
}) {
  const { content, update } = props;

  return (
    <div className="space-y-4">
      <SectionCard title="Hero" eyebrow="Khối mở đầu" dark>
        <div className="grid gap-4 lg:grid-cols-2">
          <TextField label="Eyebrow" value={content.hero.eyebrow} onChange={(value) => update((draft) => { draft.hero.eyebrow = value; })} />
          <TextField label="Ảnh nền hero" value={content.hero.imageUrl} onChange={(value) => update((draft) => { draft.hero.imageUrl = value; })} />
          <TextAreaField label="Headline" value={content.hero.title} rows={3} onChange={(value) => update((draft) => { draft.hero.title = value; })} />
          <TextAreaField label="Mô tả" value={content.hero.description} rows={4} onChange={(value) => update((draft) => { draft.hero.description = value; })} />
          <TextField label="CTA chính - nhãn" value={content.hero.primaryCta.label} onChange={(value) => update((draft) => { draft.hero.primaryCta.label = value; })} />
          <TextField label="CTA chính - link" value={content.hero.primaryCta.href} onChange={(value) => update((draft) => { draft.hero.primaryCta.href = value; })} />
          <TextField label="CTA phụ - nhãn" value={content.hero.secondaryCta.label} onChange={(value) => update((draft) => { draft.hero.secondaryCta.label = value; })} />
          <TextField label="CTA phụ - link" value={content.hero.secondaryCta.href} onChange={(value) => update((draft) => { draft.hero.secondaryCta.href = value; })} />
        </div>
      </SectionCard>

      <SectionCard title="Hero Cards" eyebrow="Các thẻ bên phải" dark>
        <div className="grid gap-4 lg:grid-cols-2">
          <TextField label="Feature card - eyebrow" value={content.hero.featureCard.eyebrow} onChange={(value) => update((draft) => { draft.hero.featureCard.eyebrow = value; })} />
          <TextAreaField label="Feature card - title" value={content.hero.featureCard.title} rows={3} onChange={(value) => update((draft) => { draft.hero.featureCard.title = value; })} />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {content.hero.miniCards.map((card, index) => (
            <div key={`${card.eyebrow}-${index}`} className="rounded-[24px] border border-white/10 bg-white/5 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-white">Mini card {index + 1}</p>
                {content.hero.miniCards.length > 1 ? (
                  <button
                    type="button"
                    className="text-xs font-semibold text-rose-200"
                    onClick={() =>
                      update((draft) => {
                        draft.hero.miniCards.splice(index, 1);
                      })
                    }
                  >
                    Xóa
                  </button>
                ) : null}
              </div>
              <div className="grid gap-3">
                <TextField label="Eyebrow" value={card.eyebrow} onChange={(value) => update((draft) => { draft.hero.miniCards[index].eyebrow = value; })} />
                <TextAreaField label="Nội dung" value={card.title} rows={3} onChange={(value) => update((draft) => { draft.hero.miniCards[index].title = value; })} />
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          className="mt-4 rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
          onClick={() =>
            update((draft) => {
              draft.hero.miniCards.push({ eyebrow: 'Card mới', title: 'Nội dung mới' });
            })
          }
        >
          Thêm mini card
        </button>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <TextField label="Metric card - eyebrow" value={content.hero.metricCard.eyebrow} onChange={(value) => update((draft) => { draft.hero.metricCard.eyebrow = value; })} />
          <TextField label="Metric card - số lớn" value={content.hero.metricCard.value} onChange={(value) => update((draft) => { draft.hero.metricCard.value = value; })} />
          <TextAreaField label="Metric card - mô tả" value={content.hero.metricCard.body} rows={3} onChange={(value) => update((draft) => { draft.hero.metricCard.body = value; })} />
          <TextField label="Metric card - CTA nhãn" value={content.hero.metricCard.ctaLabel} onChange={(value) => update((draft) => { draft.hero.metricCard.ctaLabel = value; })} />
          <TextField label="Metric card - CTA link" value={content.hero.metricCard.ctaHref} onChange={(value) => update((draft) => { draft.hero.metricCard.ctaHref = value; })} />
        </div>
      </SectionCard>

      <SectionCard title="Stats" eyebrow="Các số liệu đầu trang" dark>
        <div className="space-y-4">
          {content.stats.map((item, index) => (
            <div key={`${item.title}-${index}`} className="rounded-[24px] border border-white/10 bg-white/5 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-white">Stat {index + 1}</p>
                {content.stats.length > 1 ? (
                  <button
                    type="button"
                    className="text-xs font-semibold text-rose-200"
                    onClick={() =>
                      update((draft) => {
                        draft.stats.splice(index, 1);
                      })
                    }
                  >
                    Xóa
                  </button>
                ) : null}
              </div>
              <div className="grid gap-3 lg:grid-cols-3">
                <TextField label="Tiêu đề" value={item.title} onChange={(value) => update((draft) => { draft.stats[index].title = value; })} />
                <TextField label="Giá trị" value={item.value} onChange={(value) => update((draft) => { draft.stats[index].value = value; })} />
                <TextField label="Mô tả ngắn" value={item.subtitle} onChange={(value) => update((draft) => { draft.stats[index].subtitle = value; })} />
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          className="mt-4 rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
          onClick={() =>
            update((draft) => {
              draft.stats.push({ title: 'Stat mới', value: '0', subtitle: 'Mô tả mới' });
            })
          }
        >
          Thêm stat
        </button>
      </SectionCard>

      <SectionCard title="Narrative Sections" eyebrow="Khối thương hiệu, story panels và messaging" dark>
        <div className="grid gap-4 lg:grid-cols-2">
          <TextField label="Khối thương hiệu - eyebrow" value={content.teslaSection.eyebrow} onChange={(value) => update((draft) => { draft.teslaSection.eyebrow = value; })} />
          <TextField label="Khối thương hiệu - nút" value={content.teslaSection.buttonLabel} onChange={(value) => update((draft) => { draft.teslaSection.buttonLabel = value; })} />
          <TextAreaField label="Khối thương hiệu - tiêu đề" value={content.teslaSection.title} rows={3} onChange={(value) => update((draft) => { draft.teslaSection.title = value; })} />
          <TextField label="Khối thương hiệu - link" value={content.teslaSection.buttonHref} onChange={(value) => update((draft) => { draft.teslaSection.buttonHref = value; })} />
          <TextField label="Improvement - eyebrow" value={content.improvementCard.eyebrow} onChange={(value) => update((draft) => { draft.improvementCard.eyebrow = value; })} />
          <TextAreaField label="Improvement - title" value={content.improvementCard.title} rows={3} onChange={(value) => update((draft) => { draft.improvementCard.title = value; })} />
          <TextAreaField
            label="Các ý improvement, mỗi dòng một ý"
            value={arrayToLines(content.improvementCard.signals)}
            rows={5}
            onChange={(value) => update((draft) => { draft.improvementCard.signals = linesToArray(value); })}
          />
        </div>

        <div className="mt-6 space-y-4">
          {content.storyPanels.map((panel, index) => (
            <div key={`${panel.title}-${index}`} className="rounded-[24px] border border-white/10 bg-white/5 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-white">Story panel {index + 1}</p>
                {content.storyPanels.length > 1 ? (
                  <button
                    type="button"
                    className="text-xs font-semibold text-rose-200"
                    onClick={() =>
                      update((draft) => {
                        draft.storyPanels.splice(index, 1);
                      })
                    }
                  >
                    Xóa
                  </button>
                ) : null}
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                <TextField label="Eyebrow" value={panel.eyebrow} onChange={(value) => update((draft) => { draft.storyPanels[index].eyebrow = value; })} />
                <TextField label="Ảnh URL" value={panel.imageUrl} onChange={(value) => update((draft) => { draft.storyPanels[index].imageUrl = value; })} />
                <TextAreaField label="Title" value={panel.title} rows={3} onChange={(value) => update((draft) => { draft.storyPanels[index].title = value; })} />
                <TextAreaField label="Body" value={panel.body} rows={4} onChange={(value) => update((draft) => { draft.storyPanels[index].body = value; })} />
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          className="mt-4 rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
          onClick={() =>
            update((draft) => {
              draft.storyPanels.push({
                eyebrow: 'Story mới',
                title: 'Tiêu đề mới',
                body: 'Mô tả mới',
                imageUrl: 'https://images.unsplash.com/photo-1509391366360-2e959784a276?auto=format&fit=crop&w=1400&q=80',
              });
            })
          }
        >
          Thêm story panel
        </button>
      </SectionCard>

      <SectionCard title="Switch + CTA Sections" eyebrow="Chuyển đổi, pricing và closing" dark>
        <div className="grid gap-4 lg:grid-cols-2">
          <TextField label="Switch - eyebrow" value={content.switchCard.eyebrow} onChange={(value) => update((draft) => { draft.switchCard.eyebrow = value; })} />
          <TextAreaField label="Switch - title" value={content.switchCard.title} rows={3} onChange={(value) => update((draft) => { draft.switchCard.title = value; })} />
          <TextField label="Before - label" value={content.switchCard.before.label} onChange={(value) => update((draft) => { draft.switchCard.before.label = value; })} />
          <TextAreaField label="Before - body" value={content.switchCard.before.body} rows={3} onChange={(value) => update((draft) => { draft.switchCard.before.body = value; })} />
          <TextField label="After - label" value={content.switchCard.after.label} onChange={(value) => update((draft) => { draft.switchCard.after.label = value; })} />
          <TextAreaField label="After - body" value={content.switchCard.after.body} rows={3} onChange={(value) => update((draft) => { draft.switchCard.after.body = value; })} />
          <TextField label="Best fit - label" value={content.switchCard.bestFit.label} onChange={(value) => update((draft) => { draft.switchCard.bestFit.label = value; })} />
          <TextAreaField label="Best fit - body" value={content.switchCard.bestFit.body} rows={3} onChange={(value) => update((draft) => { draft.switchCard.bestFit.body = value; })} />
          <TextField label="Packages section - eyebrow" value={content.packagesSection.eyebrow} onChange={(value) => update((draft) => { draft.packagesSection.eyebrow = value; })} />
          <TextAreaField label="Packages section - title" value={content.packagesSection.title} rows={3} onChange={(value) => update((draft) => { draft.packagesSection.title = value; })} />
          <TextField label="Packages section - nút" value={content.packagesSection.buttonLabel} onChange={(value) => update((draft) => { draft.packagesSection.buttonLabel = value; })} />
          <TextField label="Packages section - link" value={content.packagesSection.buttonHref} onChange={(value) => update((draft) => { draft.packagesSection.buttonHref = value; })} />
          <TextField label="Newsroom - eyebrow" value={content.newsroomSection.eyebrow} onChange={(value) => update((draft) => { draft.newsroomSection.eyebrow = value; })} />
          <TextAreaField label="Newsroom - title" value={content.newsroomSection.title} rows={3} onChange={(value) => update((draft) => { draft.newsroomSection.title = value; })} />
          <TextField label="Newsroom - nút" value={content.newsroomSection.buttonLabel} onChange={(value) => update((draft) => { draft.newsroomSection.buttonLabel = value; })} />
          <TextField label="Newsroom - link" value={content.newsroomSection.buttonHref} onChange={(value) => update((draft) => { draft.newsroomSection.buttonHref = value; })} />
          <TextField label="Closing CTA - eyebrow" value={content.closingCta.eyebrow} onChange={(value) => update((draft) => { draft.closingCta.eyebrow = value; })} />
          <TextAreaField label="Closing CTA - title" value={content.closingCta.title} rows={3} onChange={(value) => update((draft) => { draft.closingCta.title = value; })} />
          <TextField label="Closing CTA chính - nhãn" value={content.closingCta.primaryCta.label} onChange={(value) => update((draft) => { draft.closingCta.primaryCta.label = value; })} />
          <TextField label="Closing CTA chính - link" value={content.closingCta.primaryCta.href} onChange={(value) => update((draft) => { draft.closingCta.primaryCta.href = value; })} />
          <TextField label="Closing CTA phụ - nhãn" value={content.closingCta.secondaryCta.label} onChange={(value) => update((draft) => { draft.closingCta.secondaryCta.label = value; })} />
          <TextField label="Closing CTA phụ - link" value={content.closingCta.secondaryCta.href} onChange={(value) => update((draft) => { draft.closingCta.secondaryCta.href = value; })} />
        </div>
      </SectionCard>
    </div>
  );
}

function AboutEditor(props: {
  content: AboutPageContent;
  update: (mutator: (content: AboutPageContent) => void) => void;
}) {
  const { content, update } = props;

  return (
    <div className="space-y-4">
      <SectionCard title="Hero" eyebrow="Giới thiệu công ty" dark>
        <div className="grid gap-4 lg:grid-cols-2">
          <TextField label="Eyebrow" value={content.hero.eyebrow} onChange={(value) => update((draft) => { draft.hero.eyebrow = value; })} />
          <TextAreaField label="Headline" value={content.hero.title} rows={3} onChange={(value) => update((draft) => { draft.hero.title = value; })} />
          <TextAreaField label="Mô tả" value={content.hero.description} rows={4} onChange={(value) => update((draft) => { draft.hero.description = value; })} />
        </div>
      </SectionCard>

      <SectionCard title="Cards" eyebrow="Ba khối giới thiệu" dark>
        <div className="space-y-4">
          {content.cards.map((card, index) => (
            <div key={`${card.title}-${index}`} className="rounded-[24px] border border-white/10 bg-white/5 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-white">Card {index + 1}</p>
                {content.cards.length > 1 ? (
                  <button
                    type="button"
                    className="text-xs font-semibold text-rose-200"
                    onClick={() =>
                      update((draft) => {
                        draft.cards.splice(index, 1);
                      })
                    }
                  >
                    Xóa
                  </button>
                ) : null}
              </div>
              <div className="grid gap-3 lg:grid-cols-3">
                <TextField label="Eyebrow" value={card.eyebrow} onChange={(value) => update((draft) => { draft.cards[index].eyebrow = value; })} />
                <TextField label="Title" value={card.title} onChange={(value) => update((draft) => { draft.cards[index].title = value; })} />
                <TextAreaField label="Body" value={card.body} rows={4} onChange={(value) => update((draft) => { draft.cards[index].body = value; })} />
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          className="mt-4 rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
          onClick={() =>
            update((draft) => {
              draft.cards.push({ eyebrow: 'Khối mới', title: 'Tiêu đề mới', body: 'Mô tả mới' });
            })
          }
        >
          Thêm card
        </button>
      </SectionCard>
    </div>
  );
}

function PricingEditor(props: {
  content: PricingPageContent;
  update: (mutator: (content: PricingPageContent) => void) => void;
}) {
  const { content, update } = props;

  return (
    <div className="space-y-4">
      <SectionCard title="Hero" eyebrow="Headline pricing" dark>
        <div className="grid gap-4 lg:grid-cols-2">
          <TextField label="Eyebrow" value={content.hero.eyebrow} onChange={(value) => update((draft) => { draft.hero.eyebrow = value; })} />
          <TextAreaField label="Headline" value={content.hero.title} rows={3} onChange={(value) => update((draft) => { draft.hero.title = value; })} />
          <TextAreaField label="Mô tả" value={content.hero.description} rows={4} onChange={(value) => update((draft) => { draft.hero.description = value; })} />
        </div>
      </SectionCard>

      <SectionCard title="Offers" eyebrow="Các gói public" dark>
        <div className="space-y-4">
          {content.offers.map((offer, index) => (
            <div key={`${offer.contractType}-${offer.name}-${index}`} className="rounded-[24px] border border-white/10 bg-white/5 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-white">Offer {index + 1}</p>
                {content.offers.length > 1 ? (
                  <button
                    type="button"
                    className="text-xs font-semibold text-rose-200"
                    onClick={() =>
                      update((draft) => {
                        draft.offers.splice(index, 1);
                      })
                    }
                  >
                    Xóa
                  </button>
                ) : null}
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                <TextField label="Loại hợp đồng" value={offer.contractType} onChange={(value) => update((draft) => { draft.offers[index].contractType = value; })} />
                <TextField label="Badge" value={offer.badge} onChange={(value) => update((draft) => { draft.offers[index].badge = value; })} />
                <TextField label="Tên gói" value={offer.name} onChange={(value) => update((draft) => { draft.offers[index].name = value; })} />
                <TextField label="Dòng giá" value={offer.pricing} onChange={(value) => update((draft) => { draft.offers[index].pricing = value; })} />
                <TextAreaField label="Tóm tắt" value={offer.summary} rows={3} onChange={(value) => update((draft) => { draft.offers[index].summary = value; })} />
                <TextAreaField
                  label="Highlights, mỗi dòng một ý"
                  value={arrayToLines(offer.highlights)}
                  rows={5}
                  onChange={(value) => update((draft) => { draft.offers[index].highlights = linesToArray(value); })}
                />
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          className="mt-4 rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
          onClick={() =>
            update((draft) => {
              draft.offers.push({
                contractType: 'Gói mới',
                name: 'Tên gói mới',
                badge: 'Badge',
                summary: 'Mô tả gói',
                highlights: ['Ưu điểm 1', 'Ưu điểm 2'],
                pricing: 'Giá mới',
              });
            })
          }
        >
          Thêm offer
        </button>
      </SectionCard>

      <SectionCard title="Notes + CTA" eyebrow="Khối hỗ trợ quyết định" dark>
        <div className="grid gap-4 lg:grid-cols-2">
          <TextField label="Notes - eyebrow" value={content.notesSection.eyebrow} onChange={(value) => update((draft) => { draft.notesSection.eyebrow = value; })} />
          <TextAreaField label="Notes - title" value={content.notesSection.title} rows={3} onChange={(value) => update((draft) => { draft.notesSection.title = value; })} />
          <TextAreaField
            label="Danh sách note, mỗi dòng một ý"
            value={arrayToLines(content.notesSection.notes)}
            rows={6}
            onChange={(value) => update((draft) => { draft.notesSection.notes = linesToArray(value); })}
          />
          <TextField label="CTA card - eyebrow" value={content.ctaCard.eyebrow} onChange={(value) => update((draft) => { draft.ctaCard.eyebrow = value; })} />
          <TextAreaField label="CTA card - title" value={content.ctaCard.title} rows={3} onChange={(value) => update((draft) => { draft.ctaCard.title = value; })} />
          <TextAreaField label="CTA card - mô tả" value={content.ctaCard.description} rows={4} onChange={(value) => update((draft) => { draft.ctaCard.description = value; })} />
          <TextField label="CTA chính - nhãn" value={content.ctaCard.primaryCta.label} onChange={(value) => update((draft) => { draft.ctaCard.primaryCta.label = value; })} />
          <TextField label="CTA chính - link" value={content.ctaCard.primaryCta.href} onChange={(value) => update((draft) => { draft.ctaCard.primaryCta.href = value; })} />
          <TextField label="CTA phụ - nhãn" value={content.ctaCard.secondaryCta.label} onChange={(value) => update((draft) => { draft.ctaCard.secondaryCta.label = value; })} />
          <TextField label="CTA phụ - link" value={content.ctaCard.secondaryCta.href} onChange={(value) => update((draft) => { draft.ctaCard.secondaryCta.href = value; })} />
        </div>
      </SectionCard>
    </div>
  );
}

function SolutionsEditor(props: {
  content: SolutionsPageContent;
  update: (mutator: (content: SolutionsPageContent) => void) => void;
}) {
  const { content, update } = props;

  return (
    <div className="space-y-4">
      <SectionCard title="Hero" eyebrow="Solutions headline" dark>
        <div className="grid gap-4 lg:grid-cols-2">
          <TextField label="Eyebrow" value={content.hero.eyebrow} onChange={(value) => update((draft) => { draft.hero.eyebrow = value; })} />
          <TextAreaField label="Headline" value={content.hero.title} rows={3} onChange={(value) => update((draft) => { draft.hero.title = value; })} />
          <TextAreaField label="Description" value={content.hero.description} rows={4} onChange={(value) => update((draft) => { draft.hero.description = value; })} />
        </div>
      </SectionCard>

      <SectionCard title="Solution Tracks" eyebrow="Cards on public solutions page" dark>
        <div className="space-y-4">
          {content.tracks.map((track, index) => (
            <div key={`${track.title}-${index}`} className="rounded-[24px] border border-white/10 bg-white/5 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-white">Track {index + 1}</p>
                {content.tracks.length > 1 ? (
                  <button
                    type="button"
                    className="text-xs font-semibold text-rose-200"
                    onClick={() =>
                      update((draft) => {
                        draft.tracks.splice(index, 1);
                      })
                    }
                  >
                    Xoa
                  </button>
                ) : null}
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                <TextField label="Eyebrow" value={track.eyebrow} onChange={(value) => update((draft) => { draft.tracks[index].eyebrow = value; })} />
                <TextField label="Image URL" value={track.imageUrl} onChange={(value) => update((draft) => { draft.tracks[index].imageUrl = value; })} />
                <TextAreaField label="Title" value={track.title} rows={3} onChange={(value) => update((draft) => { draft.tracks[index].title = value; })} />
                <TextAreaField label="Body" value={track.body} rows={4} onChange={(value) => update((draft) => { draft.tracks[index].body = value; })} />
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          className="mt-4 rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
          onClick={() =>
            update((draft) => {
              draft.tracks.push({
                eyebrow: 'Track moi',
                title: 'Tieu de moi',
                body: 'Mo ta moi',
                imageUrl: 'https://images.unsplash.com/photo-1509391366360-2e959784a276?auto=format&fit=crop&w=1400&q=80',
              });
            })
          }
        >
          Them track
        </button>
      </SectionCard>

      <SectionCard title="Delivery + CTA" eyebrow="Project journey and next step" dark>
        <div className="grid gap-4 lg:grid-cols-2">
          <TextField label="Delivery eyebrow" value={content.deliverySection.eyebrow} onChange={(value) => update((draft) => { draft.deliverySection.eyebrow = value; })} />
          <TextAreaField label="Delivery title" value={content.deliverySection.title} rows={3} onChange={(value) => update((draft) => { draft.deliverySection.title = value; })} />
          <TextAreaField
            label="Steps, one line each"
            value={arrayToLines(content.deliverySection.steps)}
            rows={5}
            onChange={(value) => update((draft) => { draft.deliverySection.steps = linesToArray(value); })}
          />
          <TextField label="Packages eyebrow" value={content.packagesSection.eyebrow} onChange={(value) => update((draft) => { draft.packagesSection.eyebrow = value; })} />
          <TextAreaField label="Packages title" value={content.packagesSection.title} rows={3} onChange={(value) => update((draft) => { draft.packagesSection.title = value; })} />
          <TextField label="CTA eyebrow" value={content.nextStepCta.eyebrow} onChange={(value) => update((draft) => { draft.nextStepCta.eyebrow = value; })} />
          <TextAreaField label="CTA title" value={content.nextStepCta.title} rows={3} onChange={(value) => update((draft) => { draft.nextStepCta.title = value; })} />
          <TextField label="CTA primary label" value={content.nextStepCta.primaryCta.label} onChange={(value) => update((draft) => { draft.nextStepCta.primaryCta.label = value; })} />
          <TextField label="CTA primary href" value={content.nextStepCta.primaryCta.href} onChange={(value) => update((draft) => { draft.nextStepCta.primaryCta.href = value; })} />
          <TextField label="CTA secondary label" value={content.nextStepCta.secondaryCta.label} onChange={(value) => update((draft) => { draft.nextStepCta.secondaryCta.label = value; })} />
          <TextField label="CTA secondary href" value={content.nextStepCta.secondaryCta.href} onChange={(value) => update((draft) => { draft.nextStepCta.secondaryCta.href = value; })} />
        </div>
      </SectionCard>
    </div>
  );
}

function ContactEditor(props: {
  content: ContactPageContent;
  update: (mutator: (content: ContactPageContent) => void) => void;
}) {
  const { content, update } = props;

  return (
    <div className="space-y-4">
      <SectionCard title="Hero" eyebrow="Contact headline" dark>
        <div className="grid gap-4 lg:grid-cols-2">
          <TextField label="Eyebrow" value={content.hero.eyebrow} onChange={(value) => update((draft) => { draft.hero.eyebrow = value; })} />
          <TextAreaField label="Headline" value={content.hero.title} rows={3} onChange={(value) => update((draft) => { draft.hero.title = value; })} />
          <TextAreaField label="Description" value={content.hero.description} rows={4} onChange={(value) => update((draft) => { draft.hero.description = value; })} />
        </div>
      </SectionCard>

      <SectionCard title="Khối liên hệ" eyebrow="Thông tin kênh liên hệ trực tiếp" dark>
        <div className="grid gap-4 lg:grid-cols-2">
          <TextField label="Nhãn nhỏ" value={content.contactCard.eyebrow} onChange={(value) => update((draft) => { draft.contactCard.eyebrow = value; })} />
          <TextField label="Tiêu đề" value={content.contactCard.title} onChange={(value) => update((draft) => { draft.contactCard.title = value; })} />
          <TextField label="Hotline" value={content.contactCard.hotline} onChange={(value) => update((draft) => { draft.contactCard.hotline = value; })} />
          <TextField label="Email" value={content.contactCard.email} onChange={(value) => update((draft) => { draft.contactCard.email = value; })} />
          <TextField label="Văn phòng" value={content.contactCard.office} onChange={(value) => update((draft) => { draft.contactCard.office = value; })} />
        </div>
      </SectionCard>

      <SectionCard title="Form Copy" eyebrow="Public lead form labels" dark>
        <div className="grid gap-4 lg:grid-cols-2">
          <TextField label="Eyebrow" value={content.formSection.eyebrow} onChange={(value) => update((draft) => { draft.formSection.eyebrow = value; })} />
          <TextAreaField label="Title" value={content.formSection.title} rows={3} onChange={(value) => update((draft) => { draft.formSection.title = value; })} />
          <TextField label="Name placeholder" value={content.formSection.namePlaceholder} onChange={(value) => update((draft) => { draft.formSection.namePlaceholder = value; })} />
          <TextField label="Email placeholder" value={content.formSection.emailPlaceholder} onChange={(value) => update((draft) => { draft.formSection.emailPlaceholder = value; })} />
          <TextField label="Company placeholder" value={content.formSection.companyPlaceholder} onChange={(value) => update((draft) => { draft.formSection.companyPlaceholder = value; })} />
          <TextField label="Site count placeholder" value={content.formSection.siteCountPlaceholder} onChange={(value) => update((draft) => { draft.formSection.siteCountPlaceholder = value; })} />
          <TextAreaField label="Message placeholder" value={content.formSection.messagePlaceholder} rows={3} onChange={(value) => update((draft) => { draft.formSection.messagePlaceholder = value; })} />
          <TextField label="Submit label" value={content.formSection.submitLabel} onChange={(value) => update((draft) => { draft.formSection.submitLabel = value; })} />
          <TextAreaField label="Success message" value={content.formSection.successMessage} rows={3} onChange={(value) => update((draft) => { draft.formSection.successMessage = value; })} />
        </div>
      </SectionCard>
    </div>
  );
}

export default function AdminCmsPage() {
  const [pages, setPages] = useState<MarketingPageRecord[]>(buildDefaultMarketingPages());
  const [selectedKey, setSelectedKey] = useState<MarketingPageKey>('home');
  const [selectedLocale, setSelectedLocale] = useState<MarketingLocale>('vi');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    listMarketingPagesRequest()
      .then((items) => setPages(normalizeMarketingPages(items)))
      .catch(() => setPages(normalizeMarketingPages()))
      .finally(() => setLoading(false));
  }, []);

  const selectedPage = useMemo(
    () =>
      normalizeMarketingPages(pages).find((page) => page.key === selectedKey) ||
      buildDefaultMarketingPages()[0],
    [pages, selectedKey],
  );

  function updateSelectedPage(mutator: (page: MarketingPageRecord) => void) {
    setPages((current) => {
      const nextPages = normalizeMarketingPages(current);
      const index = nextPages.findIndex((page) => page.key === selectedKey);
      const nextPage = clone(
        index >= 0
          ? nextPages[index]
          : buildDefaultMarketingPages().find((page) => page.key === selectedKey) ||
              nextPages[0],
      );

      mutator(nextPage);

      if (index >= 0) {
        nextPages[index] = nextPage;
      } else {
        nextPages.push(nextPage);
      }

      return nextPages;
    });
  }

  function updateLocalizedContent<
    T extends
      | HomePageContent
      | AboutPageContent
      | PricingPageContent
      | SolutionsPageContent
      | ContactPageContent,
  >(
    mutator: (content: T) => void,
  ) {
    updateSelectedPage((page) => {
      const nextContent = clone(page.content[selectedLocale]) as T;
      mutator(nextContent);
      page.content = {
        ...page.content,
        [selectedLocale]: nextContent,
      };
    });
  }

  async function handleSave() {
    setSaving(true);
    setMessage('');
    setError('');

    try {
      const payload = {
        name: selectedPage.name,
        description: selectedPage.description || undefined,
        published: selectedPage.published,
        content: clone(selectedPage.content),
      };

      const updated = await updateMarketingPageRequest(selectedPage.key, payload);

      try {
        const refreshed = await listMarketingPagesRequest();
        setPages(normalizeMarketingPages(refreshed));
      } catch {
        setPages((current) =>
          normalizeMarketingPages(current).map((page) =>
            page.key === updated.key ? updated : page,
          ),
        );
      }
      setMessage('Đã lưu nội dung CMS thành công.');
      setMessage('Đã lưu nội dung CMS và đồng bộ lại từ máy chủ.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Không thể lưu nội dung CMS.');
      if (!(nextError instanceof Error)) {
        setError('Không thể lưu nội dung CMS.');
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <SectionCard title="Website CMS" eyebrow="Landing page editor" dark>
        <p className="text-sm text-slate-300">Đang tải cấu hình nội dung website...</p>
      </SectionCard>
    );
  }

  const selectedContent = selectedPage.content[selectedLocale];

  return (
    <div className="space-y-4">
      <EditorHeader
        page={selectedPage}
        selectedKey={selectedKey}
        selectedLocale={selectedLocale}
        onSelectKey={setSelectedKey}
        onSelectLocale={setSelectedLocale}
        onTogglePublished={(value) => updateSelectedPage((page) => { page.published = value; })}
        onChangeName={(value) => updateSelectedPage((page) => { page.name = value; })}
        onChangeDescription={(value) => updateSelectedPage((page) => { page.description = value; })}
        onSave={handleSave}
        saving={saving}
        message={message}
        error={error}
      />

      {selectedKey === 'home' ? (
        <HomeEditor
          content={selectedContent as HomePageContent}
          update={(mutator) => updateLocalizedContent<HomePageContent>(mutator)}
        />
      ) : null}

      {selectedKey === 'about' ? (
        <AboutEditor
          content={selectedContent as AboutPageContent}
          update={(mutator) => updateLocalizedContent<AboutPageContent>(mutator)}
        />
      ) : null}

      {selectedKey === 'pricing' ? (
        <PricingEditor
          content={selectedContent as PricingPageContent}
          update={(mutator) => updateLocalizedContent<PricingPageContent>(mutator)}
        />
      ) : null}

      {selectedKey === 'solutions' ? (
        <SolutionsEditor
          content={selectedContent as SolutionsPageContent}
          update={(mutator) => updateLocalizedContent<SolutionsPageContent>(mutator)}
        />
      ) : null}

      {selectedKey === 'contact' ? (
        <ContactEditor
          content={selectedContent as ContactPageContent}
          update={(mutator) => updateLocalizedContent<ContactPageContent>(mutator)}
        />
      ) : null}
    </div>
  );
}
