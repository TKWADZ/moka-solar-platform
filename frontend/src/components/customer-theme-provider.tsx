'use client';

import { MoonStar, SunMedium } from 'lucide-react';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

export type CustomerThemeMode = 'light' | 'dark';

type CustomerThemeContextValue = {
  enabled: boolean;
  hydrated: boolean;
  theme: CustomerThemeMode;
  setTheme: (value: CustomerThemeMode) => void;
  toggleTheme: () => void;
};

const CUSTOMER_THEME_STORAGE_KEY = 'moka-customer-theme';

const defaultCustomerThemeContext: CustomerThemeContextValue = {
  enabled: false,
  hydrated: false,
  theme: 'light',
  setTheme: () => undefined,
  toggleTheme: () => undefined,
};

const CustomerThemeContext = createContext<CustomerThemeContextValue>(
  defaultCustomerThemeContext,
);

export function CustomerThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [theme, setTheme] = useState<CustomerThemeMode>('light');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const storedTheme = window.localStorage.getItem(CUSTOMER_THEME_STORAGE_KEY);

    if (storedTheme === 'light' || storedTheme === 'dark') {
      setTheme(storedTheme);
    }

    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    window.localStorage.setItem(CUSTOMER_THEME_STORAGE_KEY, theme);
  }, [hydrated, theme]);

  const value = useMemo<CustomerThemeContextValue>(
    () => ({
      enabled: true,
      hydrated,
      theme,
      setTheme,
      toggleTheme: () => setTheme((current) => (current === 'light' ? 'dark' : 'light')),
    }),
    [hydrated, theme],
  );

  return (
    <CustomerThemeContext.Provider value={value}>
      {children}
    </CustomerThemeContext.Provider>
  );
}

export function useCustomerTheme() {
  return useContext(CustomerThemeContext);
}

export function CustomerThemeSwitch({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const { theme, setTheme } = useCustomerTheme();
  const isDark = theme === 'dark';

  return (
    <div
      className={cn(
        compact
          ? 'customer-soft-card-muted px-4 py-4'
          : 'customer-surface-card px-5 py-5 sm:px-6 sm:py-6',
        className,
      )}
    >
      <div
        className={cn(
          'flex gap-4',
          compact
            ? 'items-center justify-between'
            : 'flex-col sm:flex-row sm:items-center sm:justify-between',
        )}
      >
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
            Giao diện
          </p>
          <h3
            className={cn(
              'mt-2 font-semibold tracking-tight',
              isDark ? 'text-white' : 'text-slate-950',
              compact ? 'text-sm' : 'text-lg sm:text-xl',
            )}
          >
            Chuyển Light mode / Dark mode
          </h3>
          {!compact ? (
            <p
              className={cn(
                'mt-2 text-sm leading-6',
                isDark ? 'text-slate-300' : 'text-slate-600',
              )}
            >
              Toàn bộ card, biểu đồ, tab bar và nút bấm của customer portal sẽ đổi đồng bộ
              theo lựa chọn này.
            </p>
          ) : null}
        </div>

        <div
          className={cn(
            'inline-flex items-center rounded-full border p-1',
            isDark
              ? 'border-white/10 bg-slate-950/78 shadow-[0_16px_36px_rgba(2,6,23,0.36)]'
              : 'border-slate-200 bg-white shadow-[0_10px_28px_rgba(148,163,184,0.14)]',
          )}
        >
          {([
            {
              value: 'light',
              label: 'Light',
              icon: SunMedium,
            },
            {
              value: 'dark',
              label: 'Dark',
              icon: MoonStar,
            },
          ] as const).map((option) => {
            const Icon = option.icon;
            const active = theme === option.value;

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setTheme(option.value)}
                className={cn(
                  'inline-flex min-h-[42px] items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition',
                  active
                    ? isDark
                      ? 'bg-white text-slate-950 shadow-[0_10px_28px_rgba(248,250,252,0.12)]'
                      : 'bg-slate-950 text-white shadow-[0_10px_28px_rgba(15,23,42,0.16)]'
                    : isDark
                      ? 'text-slate-300 hover:bg-white/[0.08] hover:text-white'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700',
                )}
                aria-pressed={active}
              >
                <Icon className="h-4 w-4" />
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
