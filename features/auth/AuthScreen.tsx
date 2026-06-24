import { AuthForm } from './AuthForm';
import { BrandPanel } from './BrandPanel';
import './auth.css';
import type { AuthMode } from './authCopy';
import { APP_NAME } from '@/lib/app';
import { Fraunces, JetBrains_Mono } from 'next/font/google';
import Link from 'next/link';

// Same display + mono pairing as the marketing landing, so the auth screen
// inherits the home page's editorial voice rather than the app's UI font.
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

interface AuthScreenProps {
  mode: AuthMode;
}

export function AuthScreen({ mode }: AuthScreenProps) {
  return (
    <main className={`au ${display.variable} ${mono.variable}`}>
      {/* atmosphere — emerald glow bleeding in from the brand side */}
      <span
        className="au-glow"
        style={{ width: 560, height: 560, top: -180, left: '-6%' }}
        aria-hidden
      />
      <span
        className="au-glow"
        style={{
          width: 420,
          height: 420,
          bottom: -200,
          left: '20%',
          opacity: 0.3,
        }}
        aria-hidden
      />

      <div className="au-layer grid min-h-svh grid-cols-1 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <BrandPanel />

        {/* form side — min-w-0 lets the column shrink below its content's
            intrinsic width so the form never overflows on narrow viewports */}
        <div className="flex min-w-0 flex-col px-6 py-8 sm:px-10 lg:px-14">
          {/* compact wordmark — the only brand cue on mobile, where the
              editorial panel is hidden */}
          <Link
            href="/"
            className="au-rise flex items-center gap-2.5 lg:invisible"
            style={{ ['--d' as string]: '0.05s' }}
            aria-label={`${APP_NAME} home`}
          >
            <span className="au-mark ff-mono text-sm">L</span>
            <span className="text-[0.95rem] font-semibold tracking-tight">
              {APP_NAME}
            </span>
          </Link>

          <div className="flex flex-1 items-center justify-center py-10">
            <div
              className="au-rise w-full max-w-sm"
              style={{ ['--d' as string]: '0.18s' }}
            >
              <AuthForm mode={mode} />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
