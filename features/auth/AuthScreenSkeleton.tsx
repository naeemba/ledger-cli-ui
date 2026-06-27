import './auth.css';

// Loading placeholder for the full-bleed auth routes. Mirrors AuthScreen's
// layout and uses the `.au` palette (deep-green ink + translucent cards) so the
// brief flash on navigation reads as the auth screen settling in — not the
// app's dashboard PageSkeleton, which is themed for the in-app chrome and looks
// out of place here.
const Bar = ({ className }: { className?: string }) => (
  <div
    className={className}
    style={{ background: 'var(--card-hi)', borderRadius: '0.5rem' }}
  />
);

export function AuthScreenSkeleton() {
  return (
    <main className="au" aria-hidden>
      <span
        className="au-glow"
        style={{ width: 560, height: 560, top: -180, left: '-6%' }}
      />

      <div className="au-layer grid min-h-svh grid-cols-1 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        {/* brand side — empty on this placeholder; the glow alone carries it */}
        <div className="hidden lg:block" />

        <div className="flex min-w-0 flex-col px-6 py-8 sm:px-10 lg:px-14">
          <div className="flex flex-1 items-center justify-center py-10">
            <div className="w-full max-w-sm animate-pulse">
              <div className="flex flex-col gap-7">
                <div className="flex flex-col gap-2">
                  <Bar className="h-10 w-3/4" />
                  <Bar className="h-4 w-full" />
                </div>
                <div className="flex flex-col gap-2.5">
                  <Bar className="h-11 w-full" />
                </div>
                <Bar className="h-px w-full" />
                <div className="flex flex-col gap-4">
                  <Bar className="h-12 w-full" />
                  <Bar className="h-11 w-full" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
