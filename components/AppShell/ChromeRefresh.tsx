'use client';

import { useEffect } from 'react';
import { isPublicPath } from './publicPaths';
import { usePathname, useRouter } from 'next/navigation';

/**
 * The root layout picks app chrome or none once per server render, and Next
 * keeps the root layout across client-side navigation. When a link crosses
 * between a public page and an app page, refetch the route so the layout is
 * rendered again for the page the user is now on: an app page gets its header
 * and banner back, a public page drops them.
 */
const ChromeRefresh = ({ renderedPublic }: { renderedPublic: boolean }) => {
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (isPublicPath(pathname) !== renderedPublic) router.refresh();
  }, [pathname, renderedPublic, router]);
  return null;
};

export default ChromeRefresh;
