/**
 * Shared number formatter for commodity prices. Kept in one place so the
 * known-prices list and the price-history detail view can't drift on the
 * fraction-digit precision they render.
 */
export const priceFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 8,
});
