import type { Metadata, Viewport } from 'next';
import '@/styles/tokens.css';
import '@/styles/ds.css';
import '@/styles/app.css';

export const metadata: Metadata = {
  title: 'RxMunshi',
  description: 'An approval-gated AI munshi for Indian pharmacies: expiry money-back, H1 register, refills and verified deliveries.',
  icons: { icon: '/favicon.svg' },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#1b1b1d' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="reachgrid" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
