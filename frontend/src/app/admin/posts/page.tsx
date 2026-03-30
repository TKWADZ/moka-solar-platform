'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { SectionCard } from '@/components/section-card';
import {
  createContentPostRequest,
  deleteContentPostRequest,
  listAdminContentPostsRequest,
  updateContentPostRequest,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { formatDateTime } from '@/lib/utils';
import { ContentPost, ContentPostStatus } from '@/types';

const emptyDraft = {
  title: '',
  slug: '',
  excerpt: '',
  content: '',
  coverImageUrl: '',
  tags: '',
  status: 'DRAFT' as ContentPostStatus,
  isFeatured: false,
};

export default function AdminPostsPage() {
  const { tt } = useI18n();
  const [posts, setPosts] = useState<ContentPost[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [form, setForm] = useState(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const selectedPost = useMemo(
    () => posts.find((post) => post.id === selectedId) || null,
    [posts, selectedId],
  );

  async function loadPosts() {
    const items = await listAdminContentPostsRequest();
    setPosts(items);
    setSelectedId((current) => current || items[0]?.id || '');
    setLoading(false);
  }

  useEffect(() => {
    loadPosts().catch(() => {
      setError('Unable to load content posts.');
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!selectedPost) {
      setForm(emptyDraft);
      return;
    }

    setForm({
      title: tt(selectedPost.title),
      slug: selectedPost.slug,
      excerpt: tt(selectedPost.excerpt || ''),
      content: tt(selectedPost.content),
      coverImageUrl: selectedPost.coverImageUrl || '',
      tags: selectedPost.tags.join(', '),
      status: selectedPost.status,
      isFeatured: selectedPost.isFeatured,
    });
  }, [selectedPost, tt]);

  async function handleSave() {
    if (!form.title.trim() || !form.content.trim()) {
      setError('Title and content are required.');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const payload = {
        title: form.title,
        slug: form.slug || undefined,
        excerpt: form.excerpt || undefined,
        content: form.content,
        coverImageUrl: form.coverImageUrl || undefined,
        tags: form.tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
        status: form.status,
        isFeatured: form.isFeatured,
      };

      if (selectedPost) {
        const updated = await updateContentPostRequest(selectedPost.id, payload);
        setPosts((current) => current.map((post) => (post.id === updated.id ? updated : post)));
        setMessage('Post updated successfully.');
      } else {
        const created = await createContentPostRequest(payload);
        setPosts((current) => [created, ...current]);
        setSelectedId(created.id);
        setMessage('Post created successfully.');
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to save content post.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedPost) {
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      await deleteContentPostRequest(selectedPost.id);
      const nextPosts = posts.filter((post) => post.id !== selectedPost.id);
      setPosts(nextPosts);
      setSelectedId(nextPosts[0]?.id || '');
      setMessage('Post archived successfully.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to archive content post.');
    } finally {
      setSaving(false);
    }
  }

  function resetDraft() {
    setSelectedId('');
    setForm(emptyDraft);
    setMessage('');
    setError('');
  }

  if (loading) {
    return (
      <SectionCard title="Content studio" eyebrow="Publishing workflow" dark>
        <p className="text-sm text-slate-300">{tt('Loading content...')}</p>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="portal-card p-5">
          <p className="text-sm text-slate-400">{tt('Total posts')}</p>
          <p className="mt-3 text-3xl font-semibold text-white">{posts.length}</p>
        </div>
        <div className="portal-card p-5">
          <p className="text-sm text-slate-400">{tt('Published')}</p>
          <p className="mt-3 text-3xl font-semibold text-white">
            {posts.filter((post) => post.status === 'PUBLISHED').length}
          </p>
        </div>
        <div className="portal-card p-5">
          <p className="text-sm text-slate-400">{tt('Featured')}</p>
          <p className="mt-3 text-3xl font-semibold text-white">
            {posts.filter((post) => post.isFeatured).length}
          </p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <SectionCard title="Article queue" eyebrow="Drafts and published stories" dark>
          <div className="mb-4 flex justify-end">
            <button type="button" className="btn-primary" onClick={resetDraft}>
              {tt('New article')}
            </button>
          </div>

          <div className="space-y-3">
            {posts.map((post) => {
              const active = post.id === selectedId;

              return (
                <button
                  key={post.id}
                  type="button"
                  onClick={() => setSelectedId(post.id)}
                  className={`w-full rounded-[24px] border px-4 py-4 text-left transition ${
                    active
                      ? 'border-white/20 bg-white text-slate-950'
                      : 'border-white/10 bg-white/5 text-white hover:bg-white/10'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.24em] text-slate-500">
                        {tt(post.status)}
                      </p>
                      <p className="mt-2 text-lg font-semibold">{tt(post.title)}</p>
                      <p className={`mt-1 text-sm ${active ? 'text-slate-600' : 'text-slate-400'}`}>
                        {post.author.fullName} • {formatDateTime(post.updatedAt)}
                      </p>
                    </div>
                    {post.isFeatured ? (
                      <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold text-white">
                        {tt('Featured')}
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </SectionCard>

        <SectionCard title="Editor" eyebrow="Create, publish and manage public content" dark>
          <div className="grid gap-4">
            <label className="grid gap-2 text-sm text-slate-300">
              <span>{tt('Title')}</span>
              <input
                className="portal-field"
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm text-slate-300">
                <span>{tt('Slug')}</span>
                <input
                  className="portal-field"
                  value={form.slug}
                  onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value }))}
                  placeholder={tt('auto-from-title')}
                />
              </label>
              <label className="grid gap-2 text-sm text-slate-300">
                <span>{tt('Status')}</span>
                <select
                  className="portal-field"
                  value={form.status}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      status: event.target.value as ContentPostStatus,
                    }))
                  }
                >
                  <option value="DRAFT">{tt('DRAFT')}</option>
                  <option value="PUBLISHED">{tt('PUBLISHED')}</option>
                  <option value="ARCHIVED">{tt('ARCHIVED')}</option>
                </select>
              </label>
            </div>

            <label className="grid gap-2 text-sm text-slate-300">
              <span>{tt('Excerpt')}</span>
              <textarea
                className="portal-field min-h-[110px]"
                value={form.excerpt}
                onChange={(event) => setForm((current) => ({ ...current, excerpt: event.target.value }))}
              />
            </label>

            <label className="grid gap-2 text-sm text-slate-300">
              <span>{tt('Content')}</span>
              <textarea
                className="portal-field min-h-[280px]"
                value={form.content}
                onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))}
              />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm text-slate-300">
                <span>{tt('Cover image URL')}</span>
                <input
                  className="portal-field"
                  value={form.coverImageUrl}
                  onChange={(event) => setForm((current) => ({ ...current, coverImageUrl: event.target.value }))}
                />
              </label>
              <label className="grid gap-2 text-sm text-slate-300">
                <span>{tt('Tags')}</span>
                <input
                  className="portal-field"
                  value={form.tags}
                  onChange={(event) => setForm((current) => ({ ...current, tags: event.target.value }))}
                  placeholder={tt('solar, ppa, billing')}
                />
              </label>
            </div>

            <label className="flex items-center gap-3 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={form.isFeatured}
                onChange={(event) =>
                  setForm((current) => ({ ...current, isFeatured: event.target.checked }))
                }
              />
              <span>{tt('Feature this article on public channels')}</span>
            </label>

            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={handleSave} className="btn-primary" disabled={saving}>
                {saving ? tt('Saving...') : selectedPost ? tt('Update article') : tt('Create article')}
              </button>
              {selectedPost ? (
                <>
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="rounded-full border border-rose-300/20 bg-rose-400/10 px-5 py-3 text-sm font-semibold text-rose-200 transition hover:bg-rose-400/15"
                    disabled={saving}
                  >
                    {tt('Archive')}
                  </button>
                  <Link
                    href={`/news/${selectedPost.slug}`}
                    target="_blank"
                    className="rounded-full border border-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                  >
                    {tt('Open public page')}
                  </Link>
                </>
              ) : null}
            </div>

            {message ? <p className="text-sm text-emerald-300">{tt(message)}</p> : null}
            {error ? <p className="text-sm text-rose-300">{tt(error)}</p> : null}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}



