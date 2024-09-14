import getDefaultDateLocale from './getDefaultDateLocale';

export enum Format {
  DATE,
  MONTH_YEAR,
}

const formatOptions: Record<Format, Intl.DateTimeFormatOptions> = {
  [Format.DATE]: {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  },
  [Format.MONTH_YEAR]: {
    year: 'numeric',
    month: 'long',
  },
};

const formatDate = (date: string, format: Format) => {
  return new Date(date).toLocaleDateString(
    getDefaultDateLocale(),
    formatOptions[format]
  );
};

export default formatDate;
