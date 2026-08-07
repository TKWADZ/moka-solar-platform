'use client';

import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { LanguageSwitcher } from '@/components/language-switcher';

export function StaffAuthShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(20,184,166,0.14),_transparent_34%),linear-gradient(145deg,#f8fafc,#e2e8f0)] px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-xl rounded-[32px] border border-white/80 bg-white/95 p-5 shadow-[0_30px_90px_rgba(15,23,42,0.14)] backdrop-blur sm:p-8">
        <div className="flex items-center justify-between gap-4">
          <Link href="/login?mode=staff" className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
            Moka Solar Staff
          </Link>
          <LanguageSwitcher dark={false} />
        </div>

        <div className="mt-8 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">{title}</h1>
        <p className="mt-3 text-sm leading-7 text-slate-600">{description}</p>

        <div className="mt-7">{children}</div>
      </div>
    </main>
  );
}
