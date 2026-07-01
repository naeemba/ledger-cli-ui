import { parseAmountParts } from './amountParts';
import { balanceDisplay } from './balanceDisplay';
import type { AccountRole } from '@/features/transactions/entry/types/accountRole';

type Props = { amount: string; role: AccountRole };

const FriendlyBalance = ({ amount, role }: Props) => {
  const { unit, magnitude, signed } = parseAmountParts(amount);
  const numeric =
    magnitude !== '' && Number.isFinite(Number(magnitude.replaceAll(',', '')));
  if (!numeric) return <span className="text-muted-foreground">—</span>;

  const { direction, chip } = balanceDisplay(role, signed);
  const favorable = direction === 'favor';
  const color = favorable ? 'text-positive' : 'text-negative';
  const arrow = favorable ? '↑' : '↓';

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`font-medium tabular-nums ${color}`}>
        <span aria-hidden="true">{arrow}</span> {unit ? `${unit} ` : ''}
        {magnitude}
        <span className="sr-only">
          {favorable ? ' in your favour' : ' owed or spent'}
        </span>
      </span>
      {chip && (
        <span className="rounded-full bg-subtle px-2 py-0.5 text-xs text-muted-foreground">
          {chip}
        </span>
      )}
    </span>
  );
};

export default FriendlyBalance;
