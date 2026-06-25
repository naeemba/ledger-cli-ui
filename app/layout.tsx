import type { Metadata } from 'next';
import './globals.css';
import AppShell from '@/components/AppShell';
import BaseCurrencyBanner from '@/components/BaseCurrencyBanner';
import { BaseCurrencyPickerSlot } from '@/components/BaseCurrencyPicker';
import { CryptoGate } from '@/components/crypto/CryptoGate';
import { APP_NAME } from '@/lib/app';
import { cn } from '@/lib/utils';
import { Geist } from 'next/font/google';

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: APP_NAME,
  description: 'NextJS reporting tool for ledger-cli journals',
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
          headerSlot={<BaseCurrencyPickerSlot />}
          bannerSlot={<BaseCurrencyBanner />}
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
