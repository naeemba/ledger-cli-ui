import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import Settings from './Settings';

// Settings pulls in client cards with server-action imports; stub the action
// barrel and child cards that aren't under test so the static render stays pure.

// Relative mock covers imports in Settings.tsx itself (clearSessionBaseCurrencyAction)
// and DangerZone.tsx (deleteAccountAction, requestAccountDeletionAction).
vi.mock('./actions', () => ({
  clearSessionBaseCurrencyAction: vi.fn(),
  setSavedBaseCurrencyAction: vi.fn(),
  setEntryTabOrderAction: vi.fn(),
  deleteAccountAction: vi.fn(),
  requestAccountDeletionAction: vi.fn(),
  changePassphraseAction: vi.fn(),
  rotateRecoveryAction: vi.fn(),
  requestEncryptionResetAction: vi.fn(),
  confirmEncryptionResetAction: vi.fn(),
  enablePasskeyUnlockAction: vi.fn(),
  disablePasskeyUnlockAction: vi.fn(),
}));

// Absolute-path mock covers BaseCurrencyForm and other child cards that
// import from '@/features/settings/actions' (different Vitest cache key).
vi.mock('@/features/settings/actions', () => ({
  clearSessionBaseCurrencyAction: vi.fn(),
  setSavedBaseCurrencyAction: vi.fn(),
  setEntryTabOrderAction: vi.fn(),
  deleteAccountAction: vi.fn(),
  requestAccountDeletionAction: vi.fn(),
  changePassphraseAction: vi.fn(),
  rotateRecoveryAction: vi.fn(),
  requestEncryptionResetAction: vi.fn(),
  confirmEncryptionResetAction: vi.fn(),
  enablePasskeyUnlockAction: vi.fn(),
  disablePasskeyUnlockAction: vi.fn(),
}));

// DangerZone calls useRouter (Next.js App Router hook) which throws outside
// the App Router context. Stub it to a no-op card so the render stays pure.
vi.mock('./DangerZone', () => ({
  default: () => null,
}));

const html = (node: React.ReactNode) => renderToStaticMarkup(node);

const common = {
  base: 'USD',
  currencies: ['USD', 'EUR'],
  savedDefault: 'USD',
  envFallback: 'USD',
  encryptionEnabled: false,
  recentActivity: [],
};

describe('Settings', () => {
  it('renders the transaction-entry-tabs card with the given order', () => {
    const out = html(
      <Settings {...common} entryTabOrder={['raw', 'types', 'form']} />
    );
    expect(out).toContain('Transaction entry tabs');
    // The reorder list renders the three tab labels and a Default marker.
    expect(out).toContain('Default');
  });
});
