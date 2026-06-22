import type { Metadata } from 'next';
import Landing from '@/features/landing';

// Marketing-tuned metadata for the public landing, overriding the root layout's
// generic app-internal title/description so search and social previews reflect
// the product pitch rather than the signed-in app.
const title = 'Ledger — interactive reports for your ledger-cli journals';
const description =
  'Turn your plain-text ledger-cli journals into interactive net-worth, balance, portfolio, and cash-flow reports. Reconcile and add entries from any device.';

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    type: 'website',
  },
};

// Public marketing landing. Signed-in visitors are redirected to /dashboard by
// the proxy (a cheap session-cookie check), so this page stays auth-free.
export default function Home() {
  return <Landing />;
}
