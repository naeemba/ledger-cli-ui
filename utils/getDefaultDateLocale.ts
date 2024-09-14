import getEnv from './getEnv';

const getDefaultDateLocale = () => {
  return getEnv().DATE_LOCALE ?? 'en-US';
};

export default getDefaultDateLocale;
