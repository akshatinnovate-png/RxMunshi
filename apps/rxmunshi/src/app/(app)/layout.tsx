'use client';
import { AppProvider } from '@/ui/app';
import { Shell } from '@/ui/shell';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider>
      <Shell>{children}</Shell>
    </AppProvider>
  );
}
