import getEnv from './getEnv';

const getLedgerCommand = () => {
  const LedgerFile = getEnv().LEDGER_FILE;
  const PriceDBFile = getEnv().LEDGER_PRICE_DB;
  return `ledger --file ${LedgerFile} --price-db ${PriceDBFile}`;
};

export default getLedgerCommand;
