import Help from '@/components/Help';
import SaveViewButton from '@/features/savedViews/SaveViewButton';
import formatAmount from '@/utils/formatAmount';

type Props = {
  account: string;
  balance: string;
  existingViewNames: string[];
};

const AccountHeader = ({ account, balance, existingViewNames }: Props) => {
  const targetPath = `/accounts/${encodeURIComponent(account)}`;
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="flex items-center gap-2">
          <div className="text-xs font-medium uppercase tracking-wider text-muted">
            Account
          </div>
          <Help label="About this account view">
            Every transaction that touched this account, most recent first. The
            Amount column is the change applied here; the Total column is the
            running balance after each transaction.
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

export default AccountHeader;
