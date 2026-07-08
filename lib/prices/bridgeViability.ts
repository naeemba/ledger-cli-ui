// The `$` = 1 USD bridge directive that `listKnownPricesInBase` prepends to its
// probe journal is fatal on ledger builds that canonicalize `$` to `USD`:
// `P 2000-01-01 $ 1 USD` is a self-price there and aborts the whole parse
// ("Assertion failed ... source != price.commodity()"). On such builds the
// bridge attempt always throws and the caller retries without it — so every
// USD-base render spends two ledger subprocesses instead of one.
//
// A given ledger binary's behaviour is fixed for the process lifetime, so we
// remember it after the first observation and skip the known-fatal bridge
// attempt on later renders. Builds that keep `$` and `USD` distinct instead
// value the bridge cleanly, so once observed 'viable' we keep using it.
//
// Pinned on globalThis, not a module-level `let`: Next.js evaluates this module
// in separate instances per server context (route handlers, RSC render), so a
// module-scoped flag would be re-learned per context rather than shared across
// the whole process.
type BridgeViability = 'unknown' | 'viable' | 'aborts';

const globalForBridge = globalThis as typeof globalThis & {
  __ledgerBridgeViability?: BridgeViability;
};

export const getBridgeViability = (): BridgeViability =>
  globalForBridge.__ledgerBridgeViability ?? 'unknown';

export const recordBridgeViable = (): void => {
  globalForBridge.__ledgerBridgeViability = 'viable';
};

export const recordBridgeAborts = (): void => {
  globalForBridge.__ledgerBridgeViability = 'aborts';
};
