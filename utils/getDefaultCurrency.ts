import getEnv from './getEnv';

const getDefaultCurrency = () => {
  return getEnv().DEFAULT_CURRENCY;
};

export default getDefaultCurrency;
