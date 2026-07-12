import type { Metadata, Viewport } from 'next';
import './globals.css';
import AppShell from '@/components/AppShell';
import BaseCurrencyBanner from '@/components/BaseCurrencyBanner';
import { BaseCurrencyPickerSlot } from '@/components/BaseCurrencyPicker';
import { CryptoGate } from '@/components/crypto/CryptoGate';
import QuickExpenseSlot from '@/features/transactions/QuickExpenseSlot';
import { APP_NAME } from '@/lib/app';
import { cn } from '@/lib/utils';
import { Geist } from 'next/font/google';

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: APP_NAME,
  description: 'NextJS reporting tool for ledger-cli journals',
  applicationName: APP_NAME,
  appleWebApp: {
    capable: true,
    title: APP_NAME,
    statusBarStyle: 'default',
  },
  // `mobile-web-app-capable` (the modern replacement for the deprecated
  // `apple-mobile-web-app-capable`) is emitted via the `other` map so the app
  // is installable as a standalone PWA shell.
  other: {
    'mobile-web-app-capable': 'yes',
  },
  // NOTE: no apple-touch-icon / manifest icon is referenced yet — none exists
  // in public/ or app/. Adding the meta below without the asset would 404, so
  // the icon is left as a follow-up (drop an app/apple-icon.png + app/icon.png
  // and Next will wire them automatically).
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Let content extend into the notch / home-indicator area; the sticky header
  // and scroll areas add their own env(safe-area-inset-*) padding to clear it.
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbfaf7' },
    { media: '(prefers-color-scheme: dark)', color: '#0a1016' },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={cn('font-sans', geist.variable)}>
      <body>
        <CryptoGate />
        <AppShell
          headerSlot={
            <>
              <QuickExpenseSlot />
              <BaseCurrencyPickerSlot />
            </>
          }
          bannerSlot={<BaseCurrencyBanner />}
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
