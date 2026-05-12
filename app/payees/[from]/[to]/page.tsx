import Payees from '@/features/payees';

const PayeesPeriodPage = async ({
  params,
}: {
  params: Promise<{ from: string; to: string }>;
}) => {
  const { from, to } = await params;
  return <Payees from={from} to={to} />;
};

export default PayeesPeriodPage;
