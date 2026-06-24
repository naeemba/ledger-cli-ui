import { Check } from 'lucide-react';
import { APP_NAME } from '@/lib/app';

const FEATURES = ['Double-entry', 'CLI-powered', 'Self-hosted'] as const;

export function BrandPanel() {
  return (
    <div className="relative hidden flex-col justify-between overflow-hidden bg-primary p-10 text-primary-foreground lg:flex">
      {/* decorative gradient wash */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40 [background:radial-gradient(120%_80%_at_0%_0%,var(--color-chart-1)/25,transparent),radial-gradient(120%_80%_at_100%_100%,var(--color-chart-2)/25,transparent)]"
      />
      <div className="relative z-10 flex items-center gap-2 text-lg font-semibold tracking-tight">
        <span className="inline-block size-5 rounded-md bg-primary-foreground/90" />
        {APP_NAME}
      </div>

      <div className="relative z-10 space-y-6">
        <p className="max-w-xs text-2xl font-semibold leading-snug">
          Track every cent. Plain text. Yours.
        </p>
        {/* decorative, static sparkline motif — no real data */}
        <div aria-hidden className="flex h-16 items-end gap-1">
          {[3, 5, 4, 7, 6, 9, 8, 11, 9, 12].map((h, i) => (
            <span
              key={i}
              className="w-2 rounded-sm bg-primary-foreground/30"
              style={{ height: `${h * 6}px` }}
            />
          ))}
        </div>
      </div>

      <ul className="relative z-10 space-y-2 text-sm text-primary-foreground/90">
        {FEATURES.map((f) => (
          <li key={f} className="flex items-center gap-2">
            <Check className="size-4" aria-hidden />
            {f}
          </li>
        ))}
      </ul>
    </div>
  );
}
