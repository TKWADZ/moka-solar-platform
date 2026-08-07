'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';

export function StaffPasswordField({
  label,
  value,
  onChange,
  autoComplete,
  dark = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  dark?: boolean;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <label className={cn('grid gap-2 text-sm font-medium', dark ? 'text-slate-200' : 'text-slate-700')}>
      <span>{label}</span>
      <span className="relative block">
        <input
          className={cn(dark ? 'portal-field' : 'field', 'min-h-12 w-full pr-12')}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          maxLength={128}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          className={cn(
            'absolute inset-y-0 right-0 flex w-12 items-center justify-center transition',
            dark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-950',
          )}
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </span>
    </label>
  );
}
