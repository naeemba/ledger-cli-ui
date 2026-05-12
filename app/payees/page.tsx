import { toISODate } from '@/utils/date';
import { redirect } from 'next/navigation';

const PayeesIndex = () => {
  const to = new Date();
  const from = new Date(to.getFullYear(), to.getMonth() - 11, 1);
  redirect(`/payees/${toISODate(from)}/${toISODate(to)}`);
};

export default PayeesIndex;
