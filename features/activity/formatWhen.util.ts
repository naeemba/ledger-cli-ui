import getDefaultDateLocale from '@/utils/getDefaultDateLocale';

/** Locale-aware date + time formatter for activity timestamps. */
const formatWhen = (d: Date): string =>
  new Date(d).toLocaleString(getDefaultDateLocale(), {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

export default formatWhen;
