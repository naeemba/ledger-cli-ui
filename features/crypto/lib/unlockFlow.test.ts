import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  derivePassphraseKek,
  generateDek,
  generateRecoveryCode,
  recoveryHkdfKey,
  toBase64,
  wrapDek,
} from './clientCrypto';
import {
  lock,
  postDek,
  unlockWithPassphrase,
  unlockWithRecovery,
} from './unlockFlow';

// Low-cost Argon2id params so tests finish fast.
const PARAMS = { m: 512, t: 1, p: 1 };

// ── helpers ──────────────────────────────────────────────────────────────────

/** Build a real Material fixture via a clientCrypto round-trip. */
async function buildMaterial(passphrase: string) {
  const dek = generateDek();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const kekPass = await derivePassphraseKek(passphrase, salt, PARAMS);

  const { code, bytes: recoveryBytes } = generateRecoveryCode();
  const kekRecovery = await recoveryHkdfKey(recoveryBytes);

  const wrapPassphrase = await wrapDek(dek, kekPass);
  const wrapRecovery = await wrapDek(dek, kekRecovery);

  return {
    dek,
    code,
    material: {
      passSalt: toBase64(salt),
      argonParams: PARAMS,
      wrapPassphrase,
      wrapRecovery,
    },
  };
}

// ── fetch mock helpers ───────────────────────────────────────────────────────

function mockFetch(materialPayload: object) {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const path = typeof url === 'string' ? url : url.toString();

    if (
      path === '/api/crypto/material' &&
      (!init || !init.method || init.method === 'GET')
    ) {
      return new Response(JSON.stringify(materialPayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (path === '/api/crypto/unlock' && init?.method === 'POST') {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (path === '/api/crypto/lock' && init?.method === 'POST') {
      return new Response(null, { status: 204 });
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
    });
  });
}

// ── tests ────────────────────────────────────────────────────────────────────

describe('unlockFlow', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ── postDek ────────────────────────────────────────────────────────────────

  describe('postDek', () => {
    it('posts the DEK as base64 to /api/crypto/unlock', async () => {
      const dek = generateDek();
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200 })
      );

      await postDek(dek);

      expect(fetchSpy).toHaveBeenCalledWith('/api/crypto/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining('"dek"'),
      });

      // Verify the posted body is valid JSON with a base64 dek field.
      const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string) as {
        dek: string;
      };
      expect(typeof body.dek).toBe('string');
      expect(body.dek.length).toBeGreaterThan(0);
    });

    it('throws the server error message on non-ok response', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Session expired' }), {
          status: 409,
        })
      );

      await expect(postDek(generateDek())).rejects.toThrow('Session expired');
    });

    it('falls back to "Unlock failed" when error response has no message', async () => {
      fetchSpy.mockResolvedValueOnce(new Response('not json', { status: 500 }));

      await expect(postDek(generateDek())).rejects.toThrow('Unlock failed');
    });
  });

  // ── unlockWithPassphrase ───────────────────────────────────────────────────

  describe('unlockWithPassphrase', () => {
    it('happy path: derives KEK, unwraps DEK, posts it', async () => {
      const passphrase = 'correct horse battery staple';
      const { dek, material } = await buildMaterial(passphrase);

      fetchSpy = mockFetch(material);
      vi.stubGlobal('fetch', fetchSpy);

      await unlockWithPassphrase(passphrase);

      // Two fetches: GET /api/crypto/material, POST /api/crypto/unlock
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(fetchSpy.mock.calls[0][0]).toBe('/api/crypto/material');
      expect(fetchSpy.mock.calls[1][0]).toBe('/api/crypto/unlock');

      // Confirm the posted DEK matches the original.
      const postedBody = JSON.parse(
        fetchSpy.mock.calls[1][1].body as string
      ) as { dek: string };
      const postedDekBytes = Uint8Array.from(atob(postedBody.dek), (c) =>
        c.charCodeAt(0)
      );
      expect([...postedDekBytes]).toEqual([...dek]);
    });

    it('throws "Incorrect passphrase." when passphrase is wrong', async () => {
      const { material } = await buildMaterial('right passphrase');

      fetchSpy = mockFetch(material);
      vi.stubGlobal('fetch', fetchSpy);

      await expect(unlockWithPassphrase('wrong passphrase')).rejects.toThrow(
        'Incorrect passphrase.'
      );

      // Should NOT call /api/crypto/unlock on a bad unwrap.
      const unlockCalls = fetchSpy.mock.calls.filter(
        (args: unknown[]) => args[0] === '/api/crypto/unlock'
      );
      expect(unlockCalls).toHaveLength(0);
    });

    it('throws "Encryption is not set up." when material fetch fails', async () => {
      fetchSpy.mockResolvedValueOnce(new Response(null, { status: 404 }));

      await expect(unlockWithPassphrase('any')).rejects.toThrow(
        'Encryption is not set up.'
      );
    });
  });

  // ── unlockWithRecovery ─────────────────────────────────────────────────────

  describe('unlockWithRecovery', () => {
    it('happy path: derives KEK from recovery code, unwraps DEK, posts it', async () => {
      const { dek, code, material } = await buildMaterial('some passphrase');

      fetchSpy = mockFetch(material);
      vi.stubGlobal('fetch', fetchSpy);

      await unlockWithRecovery(code);

      expect(fetchSpy).toHaveBeenCalledTimes(2);

      const postedBody = JSON.parse(
        fetchSpy.mock.calls[1][1].body as string
      ) as { dek: string };
      const postedDekBytes = Uint8Array.from(atob(postedBody.dek), (c) =>
        c.charCodeAt(0)
      );
      expect([...postedDekBytes]).toEqual([...dek]);
    });

    it('throws "Incorrect recovery code." when code is wrong', async () => {
      const { material } = await buildMaterial('some passphrase');
      const { code: wrongCode } = generateRecoveryCode(); // different random code

      fetchSpy = mockFetch(material);
      vi.stubGlobal('fetch', fetchSpy);

      await expect(unlockWithRecovery(wrongCode)).rejects.toThrow(
        'Incorrect recovery code.'
      );
    });
  });

  // ── lock ───────────────────────────────────────────────────────────────────

  describe('lock', () => {
    it('posts to /api/crypto/lock', async () => {
      fetchSpy.mockResolvedValueOnce(new Response(null, { status: 204 }));

      await lock();

      expect(fetchSpy).toHaveBeenCalledWith('/api/crypto/lock', {
        method: 'POST',
      });
    });
  });
});
