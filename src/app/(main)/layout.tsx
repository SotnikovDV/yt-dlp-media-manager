'use client';

import { Suspense } from 'react';
import { AppShell } from '@/components/app-shell';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background flex items-center justify-center" />}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
