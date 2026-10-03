import 'server-only';
import { isPublicPath } from './publicPaths';
import { headers } from 'next/headers';

// True when the current request is for a public page. Server slots in the root
// layout call this first so they do no per-user work (ledger runs, database
// reads) for a visitor who is only looking at a public page.
export const isPublicRequest = async (): Promise<boolean> => {
  const requestHeaders = await headers();
  return isPublicPath(requestHeaders.get('x-pathname') ?? '');
};
