'use client';

import { useEffect } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

/**
 * Route-level error boundary. The `error` object can contain server-side
 * detail (ledger stderr, file system paths, stack traces) that we MUST NOT
 * render to the client. Show a generic message and let the user retry; the
 * full error is already in the server logs by the time we land here.
 */
export default function RouteError({ error, reset }: Props) {
  useEffect(() => {
    // Browser console is fine; it stays client-side.
    console.error('Route error:', error);
  }, [error]);

  return (
    <div className="flex flex-col gap-4">
      <Alert variant="destructive">
        <AlertTitle>Something went wrong</AlertTitle>
        <AlertDescription>
          This page couldn&apos;t render. The error has been logged on the
          server.
          {error.digest && (
            <span className="ml-1 font-mono text-xs opacity-70">
              (ref: {error.digest})
            </span>
          )}
        </AlertDescription>
      </Alert>
      <div>
        <Button onClick={reset} variant="outline" size="sm">
          Try again
        </Button>
      </div>
    </div>
  );
}
