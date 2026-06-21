import Help from '@/components/Help';
import SaveViewButton from '@/features/savedViews/SaveViewButton';
import formatAmount from '@/utils/formatAmount';

type Props = {
  account: string;
  balance: string;
  existingViewNames: string[];
};

const RegisterHeader = ({ account, balance, existingViewNames }: Props) => {
  const targetPath = `/registers/monthly/${encodeURIComponent(account)}`;
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="flex items-center gap-2">
          <div className="text-xs font-medium uppercase tracking-wider text-muted">
            Monthly report
          </div>
          <Help label="About monthly report">
            Aggregated balance for this account, grouped by month. Useful for
            spotting trends or seasonality on a single account.
          </Help>
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight break-all">
          {account}
        </h1>
      </div>
      <div className="flex items-end gap-3">
        <div className="text-right">
          <div className="text-xs font-medium uppercase tracking-wider text-muted">
            Balance
          </div>
          <div className="text-2xl font-semibold tracking-tight">
            {formatAmount(balance, true)}
          </div>
        </div>
        <SaveViewButton
          targetPath={targetPath}
          existingNames={existingViewNames}
        />
      </div>
    </div>
  );
};

export default RegisterHeader;
