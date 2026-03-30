import { cn } from '@/lib/utils';

type PublicSectionProps = {
  children: React.ReactNode;
  id?: string;
  className?: string;
  density?: 'default' | 'tight' | 'wide';
};

export function PublicSection({
  children,
  id,
  className,
  density = 'default',
}: PublicSectionProps) {
  const densityClass =
    density === 'tight'
      ? 'public-section-tight'
      : density === 'wide'
        ? 'public-section-wide'
        : 'public-section';

  return (
    <section id={id} className={cn(densityClass, className)}>
      {children}
    </section>
  );
}

type SectionIntroProps = {
  eyebrow: string;
  title: string;
  body?: string;
  actions?: React.ReactNode;
  center?: boolean;
  compact?: boolean;
  className?: string;
};

export function SectionIntro({
  eyebrow,
  title,
  body,
  actions,
  center = false,
  compact = false,
  className,
}: SectionIntroProps) {
  return (
    <div
      className={cn(
        'section-intro',
        center && 'mx-auto items-center text-center',
        compact ? 'gap-3' : 'gap-4',
        className,
      )}
    >
      <div className={cn(center && 'mx-auto max-w-4xl')}>
        <p className="eyebrow">{eyebrow}</p>
        <h2 className={cn('section-title', compact && 'text-3xl sm:text-[2.4rem]')}>
          {title}
        </h2>
        {body ? <p className={cn('section-copy', center && 'mx-auto')}>{body}</p> : null}
      </div>
      {actions ? <div className={cn('cta-row', center && 'justify-center')}>{actions}</div> : null}
    </div>
  );
}
