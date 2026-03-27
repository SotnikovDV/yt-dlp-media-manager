'use client';

import { CircleHelp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { helpDocHref, type HelpDocSection } from '@/lib/help-doc';

type Props = {
  section?: HelpDocSection;
  /** Текст ссылки; по умолчанию «Справка» */
  children?: React.ReactNode;
  className?: string;
  /** Показать иконку слева */
  showIcon?: boolean;
};

export function HelpDocLink({ section, children, className, showIcon = true }: Props) {
  return (
    <a
      href={helpDocHref(section)}
      target="_blank"
      rel="noopener noreferrer"
      className={cn('inline-flex items-center gap-1.5 font-medium text-primary hover:underline', className)}
    >
      {showIcon && <CircleHelp className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />}
      {children ?? 'Справка'}
    </a>
  );
}
