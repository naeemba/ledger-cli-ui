const pad2 = (n: number) => String(n).padStart(2, '0');

export const toISODate = (d: Date): string =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export const parseISODate = (iso: string): Date => {
  const [y, m, day] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, day ?? 1);
};

export const startOfMonth = (d: Date = new Date()): Date =>
  new Date(d.getFullYear(), d.getMonth(), 1);

export const endOfMonth = (d: Date = new Date()): Date =>
  new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);

export const startOfYear = (d: Date = new Date()): Date =>
  new Date(d.getFullYear(), 0, 1);

export const endOfYear = (d: Date = new Date()): Date =>
  new Date(d.getFullYear(), 11, 31, 23, 59, 59, 999);

export const startOfQuarter = (d: Date = new Date()): Date => {
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3, 1);
};

export const endOfQuarter = (d: Date = new Date()): Date => {
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3 + 3, 0, 23, 59, 59, 999);
};

const longMonthFormatter = new Intl.DateTimeFormat('en-US', { month: 'long' });

export const longMonthNames = (): string[] =>
  Array.from({ length: 12 }, (_, i) =>
    longMonthFormatter.format(new Date(2000, i, 1))
  );
