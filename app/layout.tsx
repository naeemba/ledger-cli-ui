import type { Metadata } from 'next';
import './globals.css';
import Header from '@/components/Header';
import { APP_NAME } from '@/lib/app';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'], display: 'swap' });

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
    <html lang="en">
      <body className={inter.className}>
        <Header />
        <main className="container mx-auto px-4 pb-20 pt-8 sm:px-6 lg:px-8">
          {children}
        </main>
      </body>
    </html>
  );
}
