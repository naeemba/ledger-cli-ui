import { PriceHistoryView } from '@/features/prices';
import { requireUser } from '@/lib/auth/require-user';
import { priceService } from '@/lib/prices';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

const PriceHistoryPage = async ({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) => {
  const user = await requireUser();
  const { symbol: symbolParam } = await params;
  const symbol = decodeURIComponent(symbolParam);

  const held = await priceService.listHeldCommodities(user.id);
  if (!held.includes(symbol)) notFound();

  const points = await priceService.listPriceHistory(user.id, symbol);
  return <PriceHistoryView symbol={symbol} points={points} />;
};

export default PriceHistoryPage;
