import type { Metadata } from 'next';
import { SharedDebtView } from '@/features/debtShare';
import { debtShareRepository } from '@/lib/debt-share';

export const metadata: Metadata = {
  title: 'Shared balance',
  robots: { index: false, follow: false },
};

const Page = async ({ params }: { params: Promise<{ shareId: string }> }) => {
  const { shareId } = await params;
  const share = await debtShareRepository.findById(shareId);
  return (
    <SharedDebtView shareId={shareId} sealedPage={share?.sealedPage ?? null} />
  );
};

export default Page;
