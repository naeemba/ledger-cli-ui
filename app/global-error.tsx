'use client';

import { useEffect } from 'react';

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

/**
 * Root error boundary — fires when the error originates inside the root
 * layout itself (i.e., a place that `app/error.tsx` can't catch). Must render
 * its own `<html>`/`<body>` since the layout failed.
 *
 * Like `app/error.tsx`, this never renders the raw error to the client.
 */
export default function GlobalError({ error, reset }: Props) {
  useEffect(() => {
    console.error('Global error:', error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            padding: 32,
            fontFamily: 'system-ui, sans-serif',
            maxWidth: 600,
            margin: '40px auto',
          }}
        >
          <h1 style={{ fontSize: '1.25rem', fontWeight: 600 }}>
            The app couldn&apos;t start
          </h1>
          <p style={{ color: '#666' }}>
            The error has been logged on the server.
            {error.digest && (
              <span
                style={{
                  marginLeft: 4,
                  fontFamily: 'monospace',
                  fontSize: 12,
                  opacity: 0.7,
                }}
              >
                (ref: {error.digest})
              </span>
            )}
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              alignSelf: 'flex-start',
              padding: '6px 12px',
              borderRadius: 6,
              border: '1px solid #ccc',
              background: 'white',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
