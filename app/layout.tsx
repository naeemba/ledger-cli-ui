import type { Metadata } from 'next';
import './globals.css';
import Header from '@components/Header';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Ledger CLI UI',
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
        <div className="container mx-auto mt-10 pb-20">{children}</div>
      </body>
    </html>
  );
}
