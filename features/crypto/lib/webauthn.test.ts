import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  base64urlToBytes,
  assertPrfForCredential,
  assertPrfAny,
} from './webauthn';
import { PRF_SALT } from './clientCrypto';

// Minimal fake of a PublicKeyCredential carrying a PRF result.
const fakeCred = (id: string, first: ArrayBuffer | undefined) => ({
  id,
  getClientExtensionResults: () =>
    first ? { prf: { results: { first } } } : {},
});

const stubGet = (impl: (opts: CredentialRequestOptions) => unknown) => {
  // jsdom makes navigator read-only; use vi.stubGlobal (the supported vitest approach).
  vi.stubGlobal('navigator', { credentials: { get: vi.fn(impl) } });
};

afterEach(() => vi.unstubAllGlobals());

describe('base64urlToBytes', () => {
  it('decodes base64url (incl. -_ and missing padding) to bytes', () => {
    // [0, 1, 2, 250, 255] => standard base64 "AAEC+v8=" => base64url "AAEC-v8"
    expect(Array.from(base64urlToBytes('AAEC-v8'))).toEqual([
      0, 1, 2, 250, 255,
    ]);
  });
});

describe('assertPrfForCredential', () => {
  it('returns the PRF output and sends the fixed salt', async () => {
    const out = new Uint8Array(32).fill(7).buffer;
    let opts: CredentialRequestOptions | undefined;
    stubGet((o) => {
      opts = o;
      return fakeCred('cred-A', out);
    });
    const res = await assertPrfForCredential('cred-A');
    expect(res.credentialId).toBe('cred-A');
    expect(res.prfOutput).toHaveLength(32);
    const first = new Uint8Array(
      opts!.publicKey!.extensions!.prf!.eval!.first as ArrayBuffer
    );
    expect(Array.from(first)).toEqual(Array.from(PRF_SALT));
  });

  it('throws a clear error when PRF is unsupported', async () => {
    stubGet(() => fakeCred('cred-A', undefined));
    await expect(assertPrfForCredential('cred-A')).rejects.toThrow(
      /does not support/i
    );
  });

  it('throws when the prompt is dismissed (null credential)', async () => {
    stubGet(() => null);
    await expect(assertPrfForCredential('cred-A')).rejects.toThrow(/dismissed/i);
  });
});

describe('assertPrfAny', () => {
  it('identifies which credential answered and returns its PRF output', async () => {
    const out = new Uint8Array(32).fill(9).buffer;
    stubGet(() => fakeCred('cred-B', out));
    const res = await assertPrfAny(['cred-A', 'cred-B']);
    expect(res.credentialId).toBe('cred-B');
    expect(res.prfOutput).toHaveLength(32);
  });
});
