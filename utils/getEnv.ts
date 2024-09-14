const getEnv = () => {
  return {
    DEFAULT_CURRENCY: process.env.DEFAULT_CURRENCY,
    LEDGER_FILE: process.env.LEDGER_FILE,
    LEDGER_PRICE_DB: process.env.LEDGER_PRICE_DB,
    DATE_LOCALE: process.env.DATE_LOCALE,
  };
};

export default getEnv;
