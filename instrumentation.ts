export const register = async (): Promise<void> => {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
    const { registerPriceCron } = await import('@/lib/prices/scheduler');
    registerPriceCron();
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
};

export { captureRequestError as onRequestError } from '@sentry/nextjs';
