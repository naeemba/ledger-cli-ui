import { type NavItem } from './config';

export const useActiveMenu = (pathname: string) => {
  const isActive = (item: NavItem): boolean => {
    if (item.match === 'exact') return pathname === item.href;
    const prefix = item.activePrefix ?? item.href;
    return pathname === item.href || pathname.startsWith(prefix);
  };
  return { isActive };
};
