// Re-exported from utils so lower layers (utils/formatAmount) can share the
// same parser without a features → utils inversion. Feature-local consumers
// (FriendlyBalance) keep importing from here.
export { parseAmountParts, type AmountParts } from '@/utils/amountParts';
