import { Check } from 'lucide-react';
import { APP_NAME } from '@/lib/app';
import Link from 'next/link';

const FEATURES = ['Double-entry', 'CLI-powered', 'Self-hosted'] as const;

// Decorative emerald sparkbars — static, not real data (mirrors the home hero).
const BARS = [10, 16, 13, 22, 19, 28, 25, 34, 30, 38] as const;

// A compact echo of the landing hero's journal mockup, tying the auth screen
// back to the product's plain-text roots.
const JOURNAL = [
  '<span class="c-cmt">; your books, beautifully</span>',
  '<span class="c-date">2026/06/01</span> <span class="c-payee">Paycheck</span>',
  '    <span class="c-acct">Assets:Checking</span>   <span class="c-pos">$ 6,200.00</span>',
  '    <span class="c-acct">Income:Salary</span>',
].join('\n');

export function BrandPanel() {
  return (
    <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-[var(--line-soft)] bg-[var(--ink-2)]/40 p-10 lg:flex lg:p-12">
      {/* wordmark */}
      <Link
        href="/"
        className="au-rise relative z-10 flex items-center gap-2.5"
        style={{ ['--d' as string]: '0.05s' }}
        aria-label={`${APP_NAME} home`}
      >
        <span className="au-mark ff-mono text-sm">L</span>
        <span className="text-lg font-semibold tracking-tight">{APP_NAME}</span>
      </Link>

      {/* editorial center */}
      <div className="relative z-10 max-w-md space-y-8">
        <span
          className="au-rise au-chip ff-mono"
          style={{ ['--d' as string]: '0.12s' }}
        >
          <span className="au-chip__dot" />
          PLAIN-TEXT ACCOUNTING
        </span>

        <h2
          className="au-rise ff-display text-[clamp(2.25rem,3.4vw,3.25rem)] leading-[1.04]"
          style={{ ['--d' as string]: '0.2s' }}
        >
          Track every cent. Plain text. Yours.
        </h2>

        <div
          className="au-rise au-card au-card--lit p-0"
          style={{ ['--d' as string]: '0.3s' }}
        >
          <div className="flex items-center gap-2 border-b border-[var(--line)] px-4 py-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--red)]/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--gold)]/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--em)]/70" />
            <span className="ff-mono ml-2 text-xs text-[color:var(--txt-faint)]">
              2026.ledger
            </span>
          </div>
          <pre
            className="au-journal ff-mono overflow-hidden px-5 py-4"
            dangerouslySetInnerHTML={{ __html: JOURNAL }}
          />
        </div>

        <div
          className="au-rise au-bars"
          style={{ ['--d' as string]: '0.38s' }}
          aria-hidden
        >
          {BARS.map((h, i) => (
            <span key={i} style={{ height: `${h}px` }} />
          ))}
        </div>
      </div>

      {/* feature ticks */}
      <ul
        className="au-rise relative z-10 space-y-2.5"
        style={{ ['--d' as string]: '0.46s' }}
      >
        {FEATURES.map((f) => (
          <li key={f} className="au-tick">
            <Check className="size-4" aria-hidden />
            {f}
          </li>
        ))}
      </ul>
    </aside>
  );
}
