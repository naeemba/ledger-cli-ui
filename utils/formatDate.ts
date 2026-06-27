import { Format, formatDateWithLocale } from './formatDateCore';
import getDefaultDateLocale from './getDefaultDateLocale';

// Re-exported so existing `import formatDate, { Format } from '@/utils/formatDate'`
// call sites keep working; client components should import the client-safe
// primitives from './formatDateCore' directly.
export {
  Format,
  formatDateWithLocale,
  formatLedgerDate,
  formatLedgerDateTime,
  formatLedgerInstant,
} from './formatDateCore';

/** Format a date using the server-configured default locale (`DATE_LOCALE`). */
const formatDate = (date: string, format: Format) =>
  formatDateWithLocale(date, format, getDefaultDateLocale());

export default formatDate;
