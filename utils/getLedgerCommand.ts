const getLedgerCommand = () => {
  const LedgerFile = process.env.LEDGER_FILE;
  const PriceDBFile = process.env.LEDGER_PRICE_DB;
  return `ledger --file ${LedgerFile} --price-db ${PriceDBFile}`;
};

export default getLedgerCommand;
