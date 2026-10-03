import 'server-only';
import { isPublicPath } from './publicPaths';
import { headers } from 'next/headers';

// True when the current request is for a public page. The root layout uses it
// to skip building the app-chrome slots, so a visitor of a public page causes
// no per-user work (ledger runs, database reads).
export const isPublicRequest = async (): Promise<boolean> => {
  const requestHeaders = await headers();
  return isPublicPath(requestHeaders.get('x-pathname') ?? '');
};
