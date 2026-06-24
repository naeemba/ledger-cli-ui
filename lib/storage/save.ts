import { promises as fs } from 'fs';
import path from 'path';
import {
  keyFor,
  manifestRelName,
  readManifest,
  relPathFromKey,
  userPrefix,
  writeManifest,
  type Manifest,
} from './manifest';
import type { ObjectStore } from './objectStore';
import { getJournalDir } from '@/lib/journal/layout';

/** Thrown when the remote changed between pull and push (lost-update guard). */
export class StorageConflictError extends Error {
  constructor(message = 'Journal was modified elsewhere; reload and retry.') {
    super(message);
    this.name = 'StorageConflictError';
  }
}

const listLocalRelPaths = async (dir: string): Promise<string[]> => {
  const out: string[] = [];
  const walk = async (abs: string, rel: string): Promise<void> => {
    let entries: import('fs').Dirent[];
    try {
      entries = await fs.readdir(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const childRel = rel ? path.join(rel, e.name) : e.name;
      if (e.isDirectory()) await walk(path.join(abs, e.name), childRel);
      else if (e.name !== manifestRelName && !e.name.endsWith('.tmp'))
        out.push(childRel);
    }
  };
  await walk(dir, '');
  return out;
};

/**
 * Mirrors the local journal dir up to the remote prefix. First confirms the
 * remote still matches the manifest we pulled (else throws StorageConflictError
 * — never blindly overwrite a concurrent change). Then uploads every local
 * file, deletes remote objects with no local counterpart, and rewrites the
 * manifest with the freshly-returned ETags.
 */
export const pushFromLocal = async (
  store: ObjectStore,
  userId: string
): Promise<void> => {
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

  // Upload every local file; collect new etags.
  const localRels = await listLocalRelPaths(dir);
  const next: Manifest = {};
  for (const rel of localRels) {
    const body = await fs.readFile(path.join(dir, rel));
    const { etag } = await store.put(keyFor(userId, rel), body);
    next[rel] = etag;
  }

  // Delete remote objects that no longer exist locally.
  const localSet = new Set(localRels);
  for (const rel of remoteByRel.keys()) {
    if (!localSet.has(rel)) await store.delete(keyFor(userId, rel));
  }

  await writeManifest(userId, next);
};
