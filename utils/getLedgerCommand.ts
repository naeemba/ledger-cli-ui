import getEnv from './getEnv';

type Props = {
  sortByDate?: boolean;
};

const getLedgerCommand = (props?: Props) => {
  const LedgerFile = getEnv().LEDGER_FILE;
  const PriceDBFile = getEnv().LEDGER_PRICE_DB;
  let ledgerCommand = 'ledger';
  if (LedgerFile?.length) {
    ledgerCommand += ` --file ${LedgerFile}`;
  }
  if (PriceDBFile?.length) {
    ledgerCommand += ` --price-db ${PriceDBFile}`;
  }
  if (typeof props?.sortByDate === 'undefined' || props?.sortByDate) {
    ledgerCommand += ' --sort -date';
  }

  return ledgerCommand;
};

export default getLedgerCommand;
