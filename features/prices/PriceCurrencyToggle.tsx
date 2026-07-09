import Link from 'next/link';

type Props = { baseMode: boolean; baseCurrency: string };

const segmentClass = (active: boolean): string =>
  [
    'px-3 py-1.5 font-medium transition-opacity',
    active
      ? 'bg-accent text-accent-foreground'
      : 'opacity-60 hover:opacity-100',
  ].join(' ');

export const PriceCurrencyToggle = ({ baseMode, baseCurrency }: Props) => (
  <div
    role="group"
    aria-label="Price currency"
    className="inline-flex overflow-hidden rounded-md border border-border text-sm"
  >
    <Link
      href="/prices"
      aria-current={baseMode ? 'page' : undefined}
      className={segmentClass(baseMode)}
    >
      In {baseCurrency}
    </Link>
    <Link
      href="/prices?quote=original"
      aria-current={!baseMode ? 'page' : undefined}
      className={`${segmentClass(!baseMode)} border-l border-border`}
    >
      Original quote
    </Link>
  </div>
);
