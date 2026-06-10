export const routeLabel = (targetPath: string): string => {
  const pathname = targetPath.split('?')[0] ?? targetPath;
  if (pathname === '/transactions') return 'Transactions';
  if (pathname === '/balance' || /^\/balance\/[^/]+\/[^/]+$/.test(pathname))
    return 'Balance';
  if (/^\/payees\/[^/]+\/[^/]+$/.test(pathname)) return 'Payees';
  const register = pathname.match(/^\/registers\/monthly\/(.+)$/);
  if (register) return `Register: ${safeDecode(register[1])}`;
  const account = pathname.match(/^\/accounts\/(.+)$/);
  if (account) return `Account: ${safeDecode(account[1])}`;
  return pathname;
};

const safeDecode = (segment: string): string => {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
};
