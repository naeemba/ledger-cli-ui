/**
 * ISO-4217 fiat codes CoinGecko can quote via `vs_currencies`. This is the
 * intersection of ISO-4217 with CoinGecko's supported_vs_currencies, pinned as
 * a static list so classification needs no network call. Extend as needed; a
 * fiat absent here falls through to the crypto/manual classifier.
 */
export const SUPPORTED_FIAT: ReadonlySet<string> = new Set([
  'USD',
  'EUR',
  'TRY',
  'AUD',
  'CAD',
  'GEL',
  'GBP',
  'JPY',
  'CHF',
  'CNY',
  'INR',
  'RUB',
  'BRL',
  'ZAR',
  'KRW',
  'MXN',
  'SEK',
  'NOK',
  'DKK',
  'PLN',
  'HKD',
  'SGD',
  'NZD',
  'AED',
  'SAR',
  'THB',
  'IDR',
  'MYR',
  'PHP',
  'CZK',
  'HUF',
  'ILS',
  'CLP',
  'BHD',
  'KWD',
  'VND',
  'UAH',
  'NGN',
  'ARS',
  'BDT',
]);

export const isFiatCode = (symbol: string): boolean =>
  SUPPORTED_FIAT.has(symbol.trim().toUpperCase());
