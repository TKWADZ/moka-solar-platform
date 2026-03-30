'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PublicSection, SectionIntro } from '@/components/public-layout';
import { PublicFooter } from '@/components/public-footer';
import { PublicHeader } from '@/components/public-header';
import { SectionCard } from '@/components/section-card';
import { listPublicContentPostsRequest } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { ContentPost } from '@/types';

export default function NewsPage() {
  const [posts, setPosts] = useState<ContentPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listPublicContentPostsRequest()
      .then((items) => setPosts(items))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main>
      <PublicHeader />
      <PublicSection density="wide">
        <SectionIntro
          eyebrow="Tin tức & case study"
          title="Bài viết, công trình mẫu và ghi chú triển khai để khách hàng hiểu Moka Solar rõ hơn."
          body="Trang này giúp đội ngũ đăng nội dung bán hàng, kiến thức điện mặt trời và các câu chuyện vận hành thật trong cùng một hệ thiết kế với toàn website."
        />

        {loading ? (
          <SectionCard title="Đang tải nội dung" eyebrow="Tin công khai" dark>
            <p className="text-sm text-slate-300">Đang lấy bài viết đã xuất bản...</p>
          </SectionCard>
        ) : (
          <div className="public-grid-2">
            {posts.map((post) => (
              <Link
                key={post.id}
                href={`/news/${post.slug}`}
                className="surface-card overflow-hidden p-0"
              >
                {post.coverImageUrl ? (
                  <div
                    className="h-56 bg-cover bg-center"
                    style={{
                      backgroundImage: `linear-gradient(180deg, rgba(15,23,42,0.05), rgba(15,23,42,0.28)), url(${post.coverImageUrl})`,
                    }}
                  />
                ) : null}
                <div className="p-6">
                  <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.24em] text-slate-400">
                    <span>{post.isFeatured ? 'Nổi bật' : 'Đã xuất bản'}</span>
                    <span>•</span>
                    <span>{formatDate(post.publishedAt || post.updatedAt)}</span>
                  </div>
                  <h2 className="mt-3 text-2xl font-semibold text-white">{post.title}</h2>
                  <p className="mt-3 text-sm leading-7 text-slate-300">{post.excerpt}</p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {post.tags.map((tag) => (
                      <span key={tag} className="metric-pill text-slate-100">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </PublicSection>
      <PublicFooter />
    </main>
  );
}
