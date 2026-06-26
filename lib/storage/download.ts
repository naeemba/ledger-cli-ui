import { promises as fs } from 'fs';
import path from 'path';
import {
  fingerprint,
  listLocalRelPaths,
  readManifest,
  relPathFromKey,
  userPrefix,
  writeManifest,
  type Manifest,
} from './manifest';
import type { ObjectStore } from './objectStore';
import { decryptFromDownload } from '@/lib/crypto/journalCipher';
import { getJournalDir } from '@/lib/journal/layout';
import { createLogger } from '@/lib/log';

const log = createLogger('storage');

/**
 * Mirrors the user's remote prefix into the local journal dir. Downloads only
 * objects whose ETag differs from the local manifest, deletes local files no
 * longer present remotely, rewrites the manifest, and returns the fingerprint.
 *
 * If the store is unreachable but a manifest exists, serves the stale local
 * cache (warn + fingerprint from manifest). With no manifest, the error
 * propagates.
 */
export const pullToLocal = async (
  store: ObjectStore,
  userId: string
): Promise<{ fingerprint: string }> => {
  const dir = getJournalDir(userId);
  const prefix = userPrefix(userId);
  const prevManifest = await readManifest(userId);

  let remote;
  try {
    remote = await store.list(prefix);
  } catch (err) {
    if (Object.keys(prevManifest).length > 0) {
      log.warn({ err }, 'Garage unreachable; serving stale local cache');
      return {
        fingerprint: fingerprint(
          Object.entries(prevManifest).map(([rel, etag]) => ({
            key: prefix + rel.split(path.sep).join('/'),
            etag,
          }))
        ),
      };
    }
    throw err;
  }

  const nextManifest: Manifest = {};
  const remoteRelSet = new Set<string>();
  const resolvedRoot = path.resolve(dir) + path.sep;

  for (const obj of remote) {
    const rel = relPathFromKey(userId, obj.key);
    remoteRelSet.add(rel);
    nextManifest[rel] = obj.etag;
    const localAbs = path.join(dir, rel);
    // Defense in depth: relPathFromKey already rejects `..`; re-check containment before writing.
    if (!path.resolve(localAbs).startsWith(resolvedRoot)) {
      throw new Error(`Refusing to write outside journal dir: ${obj.key}`);
    }
    if (prevManifest[rel] === obj.etag) {
      // Unchanged — only download if the local file is missing.
      try {
        await fs.access(localAbs);
        continue;
      } catch {
        // fall through to download
      }
    }
    const { body } = await store.get(obj.key);
    const plaintext = decryptFromDownload(userId, rel, body);
    await fs.mkdir(path.dirname(localAbs), { recursive: true });
    await fs.writeFile(localAbs, plaintext);
  }

  // Delete local files that are no longer in the remote set.
  for (const rel of await listLocalRelPaths(dir)) {
    if (!remoteRelSet.has(rel)) {
      await fs.rm(path.join(dir, rel), { force: true });
    }
  }

  await writeManifest(userId, nextManifest);
  return { fingerprint: fingerprint(remote) };
};
