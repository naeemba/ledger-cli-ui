'use client';

import { CheckCircle2, KeyRound, Loader2, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { CRYPTO_COPY } from './cryptoCopy';
import { getMaterial } from './lib/cryptoMaterial';
import { enrollPasskeyForUnlock, registerPasskey } from './lib/passkeyFlow';

type Row = { credentialId: string; name: string; enabled: boolean };

const ADD = '__add__';

function friendlyError(err: unknown, fallback: string): string {
  if (typeof DOMException !== 'undefined' && err instanceof DOMException) {
    return err.name === 'NotAllowedError'
      ? CRYPTO_COPY.passkey.errors.cancelled
      : fallback;
  }
  return err instanceof Error && err.message ? err.message : fallback;
}

async function fetchPasskeys(): Promise<
  { credentialID: string; name?: string }[]
> {
  try {
    const res = await fetch('/api/auth/passkey/list-user-passkeys', {
      method: 'GET',
      credentials: 'include',
    });
    if (!res.ok) return [];
    return (await res.json()) as { credentialID: string; name?: string }[];
  } catch {
    return [];
  }
}

export function PasskeyStep({
  dek,
  onNext,
}: {
  dek: Uint8Array;
  onNext: () => void;
}) {
  const copy = CRYPTO_COPY.passkey;
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enrolledCount, setEnrolledCount] = useState(0);

  useEffect(() => {
    void (async () => {
      try {
        const [passkeys, material] = await Promise.all([
          fetchPasskeys(),
          getMaterial(),
        ]);
        const enrolled = new Set(material.passkeys.map((p) => p.credentialId));
        setRows(
          passkeys.map((p) => ({
            credentialId: p.credentialID,
            name: p.name ?? 'Passkey',
            enabled: enrolled.has(p.credentialID),
          }))
        );
        setEnrolledCount(
          passkeys.filter((p) => enrolled.has(p.credentialID)).length
        );
      } catch {
        // Promise.all rejected (in practice only getMaterial can throw —
        // fetchPasskeys swallows its own errors): list passkeys as not-enrolled.
        const passkeys = await fetchPasskeys();
        setRows(
          passkeys.map((p) => ({
            credentialId: p.credentialID,
            name: p.name ?? 'Passkey',
            enabled: false,
          }))
        );
      }
    })();
  }, []);

  async function handleAdd() {
    setError(null);
    setBusy(ADD);
    try {
      const { credentialId } = await registerPasskey('This device');
      await enrollPasskeyForUnlock(dek, credentialId, 'This device');
      setRows((r) => [
        ...r.filter((x) => x.credentialId !== credentialId),
        { credentialId, name: 'This device', enabled: true },
      ]);
      setEnrolledCount((c) => c + 1);
    } catch (err) {
      setError(friendlyError(err, copy.errors.registerFailed));
    } finally {
      setBusy(null);
    }
  }

  async function handleEnable(row: Row) {
    setError(null);
    setBusy(row.credentialId);
    try {
      await enrollPasskeyForUnlock(dek, row.credentialId, row.name);
      setRows((r) =>
        r.map((x) =>
          x.credentialId === row.credentialId ? { ...x, enabled: true } : x
        )
      );
      setEnrolledCount((c) => c + 1);
    } catch (err) {
      setError(friendlyError(err, copy.errors.enrollFailed));
    } finally {
      setBusy(null);
    }
  }

  const unenrolled = rows.filter((r) => !r.enabled);
  const enrolled = rows.filter((r) => r.enabled);

  return (
    <div className="flex flex-col gap-7">
      <div className="space-y-2">
        <h1 className="au-grad ff-display text-[clamp(2rem,4vw,2.75rem)] leading-[1.05]">
          {copy.heading}
        </h1>
        <p className="text-[0.95rem] text-[color:var(--txt-dim)] leading-relaxed">
          {copy.body}
        </p>
      </div>

      <div className="au-card p-5 flex flex-col gap-3">
        <button
          type="button"
          className="au-btn au-btn--ghost"
          onClick={handleAdd}
          disabled={busy !== null}
        >
          {busy === ADD ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {copy.addingLabel}
            </>
          ) : (
            <>
              <Plus className="size-4" aria-hidden />
              {copy.addLabel}
            </>
          )}
        </button>

        {unenrolled.map((row) => (
          <div
            key={row.credentialId}
            className="flex items-center justify-between gap-3 rounded-md border border-[var(--line)] p-3"
          >
            <span className="flex items-center gap-2 text-sm text-[color:var(--txt-dim)]">
              <KeyRound className="size-4" aria-hidden />
              {row.name}
            </span>
            <button
              type="button"
              className="au-btn au-btn--ghost"
              style={{ height: '2.25rem', fontSize: '0.8rem' }}
              onClick={() => handleEnable(row)}
              disabled={busy !== null}
            >
              {busy === row.credentialId
                ? copy.enablingLabel
                : copy.enableLabel}
            </button>
          </div>
        ))}

        {enrolled.map((row) => (
          <div
            key={row.credentialId}
            className="flex items-center justify-between gap-3 rounded-md border border-[var(--line)] p-3"
          >
            <span className="flex items-center gap-2 text-sm text-[color:var(--txt-dim)]">
              <KeyRound className="size-4" aria-hidden />
              {row.name}
            </span>
            <span
              className="flex items-center gap-1.5 text-xs ff-mono"
              style={{ color: 'var(--em)' }}
            >
              <CheckCircle2 className="size-3.5" aria-hidden />
              {copy.enrolledLabel}
            </span>
          </div>
        ))}
      </div>

      <p className="text-xs text-[color:var(--txt-faint)] leading-relaxed">
        {copy.twiceNote}
      </p>

      <button
        type="button"
        className="au-btn au-btn--primary"
        onClick={onNext}
        disabled={busy !== null}
      >
        {enrolledCount > 0 ? copy.continueLabel : copy.skipLabel}
      </button>

      <p className="au-error" aria-live="polite" aria-atomic="true">
        {error ?? ''}
      </p>
    </div>
  );
}
