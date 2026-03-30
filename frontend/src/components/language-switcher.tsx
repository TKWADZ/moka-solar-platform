'use client';

import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export function LanguageSwitcher({ dark = false }: { dark?: boolean }) {
  const { locale, setLocale } = useI18n();

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full p-1',
        dark ? 'border border-white/10 bg-white/5' : 'border border-slate-200 bg-white',
      )}
    >
      {[
        { value: 'vi', label: 'VI' },
        { value: 'en', label: 'EN' },
      ].map((item) => {
        const active = locale === item.value;

        return (
          <button
            key={item.value}
            type="button"
            onClick={() => setLocale(item.value as 'vi' | 'en')}
            className={cn(
              'rounded-full px-3 py-1.5 text-xs font-semibold transition',
              active
                ? dark
                  ? 'bg-white text-slate-950'
                  : 'bg-slate-950 text-white'
                : dark
                  ? 'text-slate-300 hover:bg-white/[0.08]'
                  : 'text-slate-500 hover:bg-slate-100',
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
