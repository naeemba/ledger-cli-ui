import {
  ArrowLeftRight,
  ArrowRight,
  Coins,
  Fingerprint,
  GitCompareArrows,
  LineChart,
  PieChart,
  ServerCog,
  Sparkles,
  Wallet,
} from 'lucide-react';
import Reveal from './Reveal';
import './landing.css';
import { Fraunces, JetBrains_Mono } from 'next/font/google';
import Link from 'next/link';

const display = Fraunces({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  style: ['normal', 'italic'],
});
const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

const SIGN_IN = '/sign-in';

const FEATURES = [
  {
    icon: LineChart,
    title: 'Net worth, over time',
    body: 'Watch assets minus liabilities trend month over month, valued in your base currency.',
  },
  {
    icon: PieChart,
    title: 'Portfolio & holdings',
    body: 'Break down investments by commodity with live prices and unrealized gains.',
  },
  {
    icon: ArrowLeftRight,
    title: 'Transactions & payees',
    body: 'Search, filter, and add entries fast — then see exactly where money flows.',
  },
  {
    icon: GitCompareArrows,
    title: 'Reconcile with confidence',
    body: 'Tick off postings against a statement until every cent agrees.',
  },
  {
    icon: Coins,
    title: 'Multi-currency, natively',
    body: 'Mix currencies and securities; convert everything to one yardstick on the fly.',
  },
  {
    icon: Wallet,
    title: 'Cash flow & debts',
    body: 'Compare income against spending and keep loans and balances in view.',
  },
];

const STEPS = [
  {
    k: '01',
    title: 'Bring your journal',
    body: 'Point Ledger at your existing ledger-cli journal. No migration, no lock-in — it reads the plain text you already trust.',
  },
  {
    k: '02',
    title: 'Explore the reports',
    body: 'Net worth, balances, portfolio, cash flow, payees — every report you used to build by hand, now interactive and instant.',
  },
  {
    k: '03',
    title: 'Stay reconciled',
    body: 'Add entries from templates, reconcile against statements, and keep your books honest from any device.',
  },
];

export default function Landing() {
  return (
    <div className={`lp ${display.variable} ${mono.variable}`}>
      {/* atmosphere */}
      <span
        className="lp-glow lp-glow--em"
        style={{ width: 620, height: 620, top: -180, left: '52%' }}
        aria-hidden
      />
      <span
        className="lp-glow lp-glow--gold"
        style={{
          width: 380,
          height: 380,
          top: 120,
          left: '-8%',
          opacity: 0.28,
        }}
        aria-hidden
      />

      {/* ───────── nav ───────── */}
      <header className="lp-nav">
        <nav className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link
            href="/"
            className="flex items-center gap-2.5"
            aria-label="Ledger home"
          >
            <span className="lp-mark ff-mono text-sm">L</span>
            <span className="text-[0.95rem] font-semibold tracking-tight">
              Ledger
            </span>
          </Link>
          <div className="hidden items-center gap-8 md:flex">
            <a href="#features" className="lp-link">
              Features
            </a>
            <a href="#how" className="lp-link">
              How it works
            </a>
            <a href="#ethos" className="lp-link">
              Philosophy
            </a>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link href={SIGN_IN} className="lp-link hidden px-2 sm:inline-flex">
              Sign in
            </Link>
            <Link
              href={SIGN_IN}
              className="lp-btn lp-btn--primary !h-10 !px-4 text-sm"
            >
              Get started
            </Link>
          </div>
        </nav>
      </header>

      {/* ───────── hero ───────── */}
      <section className="lp-layer mx-auto grid w-full max-w-7xl items-center gap-14 px-5 pb-10 pt-16 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:gap-10 lg:pt-24">
        <div>
          <div className="lp-rise" style={{ ['--d' as string]: '0.05s' }}>
            <span className="lp-chip ff-mono">
              <span className="lp-chip__dot" />
              PLAIN-TEXT ACCOUNTING, FULLY VISUALIZED
            </span>
          </div>

          <h1
            className="lp-rise ff-display mt-7 text-[clamp(2.75rem,6.5vw,5rem)] leading-[0.98]"
            style={{ ['--d' as string]: '0.12s' }}
          >
            Every dollar,
            <br />
            <span className="lp-grad italic">beautifully</span> accounted for.
          </h1>

          <p
            className="lp-rise mt-7 max-w-xl text-[1.075rem] leading-relaxed text-[color:var(--txt-dim)]"
            style={{ ['--d' as string]: '0.2s' }}
          >
            Ledger turns your{' '}
            <span className="ff-mono text-[color:var(--txt)]">ledger-cli</span>{' '}
            journals into a living financial workspace — net worth, cash flow,
            portfolio, and reconciliation, all in one calm, fast place.
          </p>

          <div
            className="lp-rise mt-9 flex flex-wrap items-center gap-3"
            style={{ ['--d' as string]: '0.28s' }}
          >
            <Link href={SIGN_IN} className="lp-btn lp-btn--primary">
              Get started — it&apos;s free
              <ArrowRight size={18} strokeWidth={2.2} />
            </Link>
            <a href="#features" className="lp-btn lp-btn--ghost">
              Explore features
            </a>
          </div>

          <p
            className="lp-rise mt-5 flex items-center gap-2 text-sm text-[color:var(--txt-faint)]"
            style={{ ['--d' as string]: '0.36s' }}
          >
            <Fingerprint size={15} />
            No passwords — sign in with a magic link or passkey. Your data stays
            yours.
          </p>
        </div>

        {/* hero mockup cluster */}
        <div
          className="lp-rise relative"
          style={{ ['--d' as string]: '0.34s' }}
        >
          {/* journal file */}
          <div className="lp-card lp-card--lit p-0">
            <div className="flex items-center gap-2 border-b border-[var(--line)] px-4 py-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--red)]/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--gold)]/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--em)]/70" />
              <span className="ff-mono ml-2 text-xs text-[color:var(--txt-faint)]">
                2026.ledger
              </span>
            </div>
            <pre
              className="lp-journal ff-mono overflow-hidden px-5 py-4 text-[color:var(--txt)]"
              dangerouslySetInnerHTML={{
                __html: [
                  '<span class="c-cmt">; opening the books</span>',
                  '<span class="c-date">2026/06/01</span> <span class="c-payee">Paycheck — Studio</span>',
                  '    <span class="c-acct">Assets:Checking</span>          <span class="c-pos">$ 6,200.00</span>',
                  '    <span class="c-acct">Income:Salary</span>',
                  '',
                  '<span class="c-date">2026/06/03</span> <span class="c-payee">Vanguard</span>',
                  '    <span class="c-acct">Assets:Brokerage</span>      <span class="c-pos">12 VTI @ $268.40</span>',
                  '    <span class="c-acct">Assets:Checking</span>',
                  '',
                  '<span class="c-date">2026/06/05</span> <span class="c-payee">Rent</span>',
                  '    <span class="c-acct">Expenses:Housing</span>        <span class="c-pos">$ 2,100.00</span>',
                  '    <span class="c-acct">Assets:Checking</span>         <span class="c-neg">$-2,100.00</span><span class="lp-cursor"></span>',
                ].join('\n'),
              }}
            />
          </div>

          {/* net-worth card, overlapping */}
          <div className="lp-card lp-card--lit lp-float absolute -bottom-10 -left-6 w-[58%] p-5 sm:-left-10 sm:w-[56%]">
            <p className="text-xs uppercase tracking-wider text-[color:var(--txt-faint)]">
              Net worth
            </p>
            <p className="ff-mono mt-1 text-2xl font-semibold sm:text-[1.7rem]">
              $284,910
            </p>
            <p className="ff-mono mt-0.5 text-xs text-[color:var(--em)]">
              ▲ 4.2% this month
            </p>
            <svg
              className="lp-spark mt-3 w-full"
              viewBox="0 0 240 70"
              preserveAspectRatio="none"
              height="56"
              aria-hidden
            >
              <defs>
                <linearGradient id="lpArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--em)" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="var(--em)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                className="area"
                d="M0,58 C30,52 45,40 70,42 C98,44 110,24 140,22 C172,20 188,12 210,9 L240,6 L240,70 L0,70 Z"
              />
              <path
                className="line"
                d="M0,58 C30,52 45,40 70,42 C98,44 110,24 140,22 C172,20 188,12 210,9 L240,6"
              />
            </svg>
          </div>

          {/* small monthly chip */}
          <div className="lp-card lp-float lp-float--slow absolute -right-3 top-6 px-4 py-3 sm:-right-6">
            <p className="text-[0.65rem] uppercase tracking-wider text-[color:var(--txt-faint)]">
              Cash flow · Jun
            </p>
            <p className="ff-mono mt-0.5 text-base font-semibold text-[color:var(--em)]">
              +$3,420
            </p>
          </div>
        </div>
      </section>

      {/* ───────── marquee / principles ───────── */}
      <div className="lp-layer mt-20 border-y border-[var(--line-soft)] py-5 sm:mt-28">
        <div className="lp-marquee-wrap overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]">
          <div className="lp-marquee ff-mono text-sm text-[color:var(--txt-faint)]">
            {[0, 1].map((dup) => (
              <div
                key={dup}
                className="flex shrink-0 gap-14"
                aria-hidden={dup === 1}
              >
                <span>DOUBLE-ENTRY</span>
                <span className="text-[color:var(--em)]">◆</span>
                <span>MULTI-CURRENCY</span>
                <span className="text-[color:var(--em)]">◆</span>
                <span>SELF-HOSTABLE</span>
                <span className="text-[color:var(--em)]">◆</span>
                <span>PLAIN TEXT FOREVER</span>
                <span className="text-[color:var(--em)]">◆</span>
                <span>NO VENDOR LOCK-IN</span>
                <span className="text-[color:var(--em)]">◆</span>
                <span>BUILT ON LEDGER-CLI</span>
                <span className="text-[color:var(--em)]">◆</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ───────── features ───────── */}
      <section
        id="features"
        className="lp-layer mx-auto w-full max-w-7xl px-5 py-24 sm:px-8 sm:py-32"
      >
        <Reveal className="max-w-2xl">
          <p className="ff-mono text-sm tracking-widest text-[color:var(--em)]">
            EVERYTHING IN ONE WORKSPACE
          </p>
          <h2 className="ff-display mt-4 text-[clamp(2rem,4vw,3.25rem)] leading-tight">
            The reports you built by hand, now alive.
          </h2>
          <p className="mt-4 text-[1.05rem] text-[color:var(--txt-dim)]">
            Every view reads straight from your journal. Nothing to sync,
            nothing to import — just your numbers, rendered the way they
            deserve.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 0.08}>
              <article className="lp-card lp-feature h-full p-6">
                <div className="lp-ico">
                  <f.icon size={20} strokeWidth={1.8} />
                </div>
                <h3 className="mt-5 text-lg font-semibold tracking-tight">
                  {f.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[color:var(--txt-dim)]">
                  {f.body}
                </p>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ───────── how it works ───────── */}
      <section
        id="how"
        className="lp-layer border-y border-[var(--line-soft)] bg-[var(--ink-2)]/40"
      >
        <div className="mx-auto w-full max-w-7xl px-5 py-24 sm:px-8 sm:py-32">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="ff-mono text-sm tracking-widest text-[color:var(--em)]">
              FROM TEXT TO INSIGHT
            </p>
            <h2 className="ff-display mt-4 text-[clamp(2rem,4vw,3.25rem)] leading-tight">
              Three steps to clearer books.
            </h2>
          </Reveal>

          <div className="mt-16 grid gap-px overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--line)] md:grid-cols-3">
            {STEPS.map((s, i) => (
              <Reveal key={s.k} delay={i * 0.1}>
                <div className="h-full bg-[var(--ink)] p-8">
                  <span className="lp-step-num ff-mono">{s.k}</span>
                  <h3 className="ff-display mt-4 text-2xl">{s.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-[color:var(--txt-dim)]">
                    {s.body}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── philosophy / showcase ───────── */}
      <section
        id="ethos"
        className="lp-layer mx-auto w-full max-w-7xl px-5 py-24 sm:px-8 sm:py-32"
      >
        <Reveal>
          <div className="lp-card lp-card--lit relative overflow-hidden">
            {/* self-hosted texture (public/) — degrades to the gradient
                underneath if it fails. Kept local rather than hotlinked so the
                conversion-critical page has no uncontrolled third-party request
                and works offline / behind a strict CSP. */}
            <div
              className="absolute inset-0 opacity-[0.16]"
              style={{
                backgroundImage: "url('/landing-texture.jpg')",
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
              aria-hidden
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  'linear-gradient(105deg, var(--ink) 30%, oklch(20% 0.02 165 / 0.7) 70%, transparent)',
              }}
              aria-hidden
            />
            <div className="relative grid gap-10 p-9 sm:p-14 lg:grid-cols-[1.4fr_1fr] lg:items-center">
              <div>
                <Sparkles size={22} className="text-[color:var(--em)]" />
                <blockquote className="ff-display mt-6 text-[clamp(1.6rem,3.2vw,2.75rem)] leading-[1.15]">
                  “Plain text outlives every app. The numbers you record today
                  should still be{' '}
                  <span className="lp-grad italic">yours in thirty years</span>{' '}
                  — readable, portable, and unbreakable.”
                </blockquote>
                <p className="mt-7 text-sm text-[color:var(--txt-dim)]">
                  That conviction is why Ledger never touches your source of
                  truth. It reads your journal, renders it gorgeously, and
                  leaves the file exactly as it found it.
                </p>
              </div>
              <ul className="grid gap-3">
                {[
                  'Your journal is the database — not us',
                  'Open format, exportable any time',
                  'Self-host it, or sign in and go',
                  'Built on the battle-tested ledger-cli',
                ].map((line) => (
                  <li
                    key={line}
                    className="flex items-start gap-3 rounded-xl border border-[var(--line)] bg-[var(--card)] px-4 py-3 text-sm"
                  >
                    <span className="mt-0.5 text-[color:var(--em)]">✓</span>
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ───────── final CTA ───────── */}
      <section className="lp-layer relative overflow-hidden">
        <span
          className="lp-glow lp-glow--em"
          style={{
            width: 700,
            height: 360,
            bottom: -160,
            left: '50%',
            transform: 'translateX(-50%)',
            opacity: 0.4,
          }}
          aria-hidden
        />
        <div className="relative mx-auto w-full max-w-3xl px-5 py-28 text-center sm:py-36">
          <Reveal>
            <span className="lp-chip ff-mono">
              <ServerCog size={14} />
              SET UP IN MINUTES
            </span>
            <h2 className="ff-display mt-7 text-[clamp(2.4rem,5.5vw,4rem)] leading-[1.02]">
              Start keeping
              <br />
              <span className="lp-grad italic">better books</span> today.
            </h2>
            <p className="mx-auto mt-6 max-w-md text-[1.05rem] text-[color:var(--txt-dim)]">
              Free to start. Sign in with a passkey or magic link and see your
              whole financial picture in one screen.
            </p>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <Link href={SIGN_IN} className="lp-btn lp-btn--primary">
                Create your workspace
                <ArrowRight size={18} strokeWidth={2.2} />
              </Link>
              <a href="#features" className="lp-btn lp-btn--ghost">
                See what&apos;s inside
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ───────── footer ───────── */}
      <footer className="lp-layer border-t border-[var(--line-soft)]">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-4 px-5 py-10 text-sm text-[color:var(--txt-faint)] sm:flex-row sm:px-8">
          <div className="flex items-center gap-2.5">
            <span className="lp-mark ff-mono text-xs">L</span>
            <span className="text-[color:var(--txt-dim)]">
              Ledger — plain-text finance, beautifully visualized.
            </span>
          </div>
          <div className="flex items-center gap-6">
            <a href="#features" className="lp-link">
              Features
            </a>
            <a href="#how" className="lp-link">
              How it works
            </a>
            <Link href={SIGN_IN} className="lp-link">
              Sign in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
