import { promises as fs } from 'fs';
import path from 'path';
import {
  keyFor,
  listLocalRelPaths,
  readManifest,
  relPathFromKey,
  userPrefix,
  writeManifest,
  type Manifest,
} from './manifest';
import type { ObjectMeta, ObjectStore } from './objectStore';
import { MAGIC } from '@/lib/crypto/fileCrypto';
import { encryptForUpload } from '@/lib/crypto/journalCipher';
import { getSessionDek, LockedError } from '@/lib/crypto/sessionKeys';
import { getJournalDir } from '@/lib/journal/layout';

/** Thrown when the remote changed between pull and push (lost-update guard). */
export class StorageConflictError extends Error {
  constructor(message = 'Journal was modified elsewhere; reload and retry.') {
    super(message);
    this.name = 'StorageConflictError';
  }
}

/**
 * Throws LockedError if any stored object is ciphertext. Called only when no
 * key is in memory: uploading then would replace an encrypted journal with
 * plaintext. Reads just the first few bytes of each file (the ciphertext
 * marker), so a plaintext user with a large journal does not download it all.
 * A file shorter than the marker cannot be ciphertext and is skipped.
 */
const refuseIfStoredEncrypted = async (
  store: ObjectStore,
  remote: readonly ObjectMeta[]
): Promise<void> => {
  for (const { key, size } of remote) {
    if (size < MAGIC.length) continue;
    const head = await store.getHead(key, MAGIC.length);
    if (head.equals(MAGIC)) throw new LockedError();
  }
};

/**
 * The message a user sees when a save to storage fails. A conflict or a
 * locked journal says what to do; anything else gets the generic text.
 */
export const storageFailureMessage = (error: unknown): string => {
  if (error instanceof StorageConflictError) return error.message;
  if (error instanceof LockedError)
    return 'Your journal is locked. Unlock it and try again.';
  return 'Failed to save journal to storage.';
};

/**
 * Mirrors the local journal dir up to the remote prefix. First confirms the
 * remote still matches the manifest we pulled (else throws StorageConflictError
 * — never blindly overwrite a concurrent change). Then uploads every local
 * file, deletes remote objects with no local counterpart, and rewrites the
 * manifest with the freshly-returned ETags.
 *
 * The session key is read once, before anything else, and every file is
 * encrypted with that same key. A Lock that lands mid-upload therefore cannot
 * send the files after it in plaintext over the ciphertext already stored.
 *
 * With no key at the start, the upload is refused (LockedError) if any stored
 * file is ciphertext. Example: the user clicks Lock in one tab, the decrypted
 * files stay on disk, and a save from a stale tab would otherwise push them in
 * plaintext over the encrypted journal. The check reads storage, not the
 * crypto row, so it holds whatever the database says.
 */
export const pushFromLocal = async (
  store: ObjectStore,
  userId: string
): Promise<void> => {
  const dek = getSessionDek(userId);
  const dir = getJournalDir(userId);
  const prefix = userPrefix(userId);
  const manifest = await readManifest(userId);

  // Conflict check: remote must equal the snapshot we last pulled.
  const remote = await store.list(prefix);
  const remoteByRel = new Map(
    remote.map((o) => [relPathFromKey(userId, o.key), o.etag])
  );
  const allRels = new Set([...Object.keys(manifest), ...remoteByRel.keys()]);
  for (const rel of allRels) {
    if (manifest[rel] !== remoteByRel.get(rel)) {
      throw new StorageConflictError();
    }
  }

  if (!dek) await refuseIfStoredEncrypted(store, remote);

  // Upload every local file; collect new etags.
  const localRels = await listLocalRelPaths(dir);
  const next: Manifest = {};
  for (const rel of localRels) {
    const body = await fs.readFile(path.join(dir, rel));
    const payload = encryptForUpload(dek, rel, body);
    const { etag } = await store.put(keyFor(userId, rel), payload);
    next[rel] = etag;
  }

  // Delete remote objects that no longer exist locally.
  const localSet = new Set(localRels);
  for (const rel of remoteByRel.keys()) {
    if (!localSet.has(rel)) await store.delete(keyFor(userId, rel));
  }

  await writeManifest(userId, next);
};
