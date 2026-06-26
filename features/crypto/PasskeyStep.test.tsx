import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import { PasskeyStep } from './PasskeyStep';

// Mock the flow module so the test never pulls in the server action transitively.
vi.mock('./lib/passkeyFlow', () => ({
  registerPasskey: vi.fn(),
  enrollPasskeyForUnlock: vi.fn(),
}));

// Mock getMaterial so the test never hits the network.
vi.mock('./lib/cryptoMaterial', () => ({
  getMaterial: vi.fn(),
}));

describe('PasskeyStep', () => {
  it('renders the add-device and skip controls', () => {
    const out = renderToStaticMarkup(
      <PasskeyStep dek={new Uint8Array(32)} onNext={() => {}} />
    );
    expect(out).toContain('Add this device');
    expect(out).toContain('Skip for now');
  });
});
