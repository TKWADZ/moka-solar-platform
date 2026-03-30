'use client';

import Image from 'next/image';
import { usePublicSiteConfig } from '@/components/public-site-provider';
import { cn } from '@/lib/utils';

type BrandLogoProps = {
  className?: string;
  logoWrapClassName?: string;
  imageClassName?: string;
  caption?: string;
  captionClassName?: string;
  priority?: boolean;
  compact?: boolean;
};

export function BrandLogo({
  className,
  logoWrapClassName,
  imageClassName,
  caption,
  captionClassName,
  priority = false,
  compact = false,
}: BrandLogoProps) {
  const { siteConfig } = usePublicSiteConfig();

  return (
    <div className={cn('flex min-w-0 items-center gap-3', className)}>
      <div
        className={cn(
          'relative overflow-hidden rounded-[18px] border border-white/10 bg-white/90 shadow-[0_18px_45px_rgba(2,6,23,0.18)]',
          compact ? 'h-14 w-[176px] sm:h-16 sm:w-[214px]' : 'h-16 w-[196px] sm:h-20 sm:w-[248px]',
          logoWrapClassName,
        )}
      >
        <Image
          src={siteConfig.brand.logo.src}
          alt={siteConfig.brand.logo.alt}
          fill
          priority={priority}
          className={cn('object-contain p-1.5 sm:p-2', imageClassName)}
        />
      </div>

      {caption ? (
        <div className="min-w-0">
          <p className={cn('eyebrow truncate text-slate-500', captionClassName)}>{caption}</p>
        </div>
      ) : null}
    </div>
  );
}
