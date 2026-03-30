'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { PublicFooter } from '@/components/public-footer';
import { PublicHeader } from '@/components/public-header';
import { getPublicContentPostRequest } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { formatDate } from '@/lib/utils';
import { ContentPost } from '@/types';

export default function NewsDetailPage() {
  const { tt } = useI18n();
  const params = useParams<{ slug: string }>();
  const [post, setPost] = useState<ContentPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!params?.slug) {
      return;
    }

    getPublicContentPostRequest(params.slug)
      .then((item) => setPost(item))
      .catch((nextError) =>
        setError(nextError instanceof Error ? nextError.message : 'Unable to load article.'),
      )
      .finally(() => setLoading(false));
  }, [params?.slug]);

  return (
    <main>
      <PublicHeader />
      <section className="shell py-12">
        <Link href="/news" className="text-sm font-semibold text-slate-500 transition hover:text-slate-950">
          ← {tt('Back to news')}
        </Link>

        {loading ? (
          <div className="surface-card mt-6 p-6 text-sm text-slate-600">{tt('Loading article...')}</div>
        ) : error || !post ? (
          <div className="surface-card mt-6 p-6 text-sm text-rose-500">{error ? tt(error) : tt('Article not found.')}</div>
        ) : (
          <article className="mt-6 overflow-hidden rounded-[36px] border border-slate-200 bg-white shadow-[0_30px_90px_-45px_rgba(15,23,42,0.35)]">
            {post.coverImageUrl ? (
              <div
                className="h-72 bg-cover bg-center"
                style={{ backgroundImage: `linear-gradient(180deg, rgba(15,23,42,0.08), rgba(15,23,42,0.45)), url(${post.coverImageUrl})` }}
              />
            ) : null}
            <div className="px-6 py-8 sm:px-10">
              <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.24em] text-slate-400">
                <span>{tt(post.status)}</span>
                <span>•</span>
                <span>{formatDate(post.publishedAt || post.updatedAt)}</span>
                <span>•</span>
                <span>{post.author.fullName}</span>
              </div>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950">
                {post.title}
              </h1>
              {post.excerpt ? (
                <p className="mt-4 max-w-3xl text-lg text-slate-600">{post.excerpt}</p>
              ) : null}
              <div className="mt-8 flex flex-wrap gap-2">
                {post.tags.map((tag) => (
                  <span key={tag} className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600">
                    {tag}
                  </span>
                ))}
              </div>
              <div className="prose prose-slate mt-10 max-w-none whitespace-pre-line text-slate-700">
                {post.content}
              </div>
            </div>
          </article>
        )}
      </section>
      <PublicFooter />
    </main>
  );
}

