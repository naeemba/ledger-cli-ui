import { SAVED_VIEW_ROUTES } from '@/lib/savedViews/routes';

export const routeLabel = (targetPath: string): string => {
  const pathname = targetPath.split('?')[0] ?? targetPath;
  const route = SAVED_VIEW_ROUTES.find((r) => r.match(pathname));
  return route ? route.label(pathname) : pathname;
};
