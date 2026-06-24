import { promises as fs } from 'fs';
import path from 'path';
import {
  fingerprint,
  manifestRelName,
  readManifest,
  relPathFromKey,
  userPrefix,
  writeManifest,
  type Manifest,
} from './manifest';
import type { ObjectStore } from './objectStore';
import { getJournalDir } from '@/lib/journal/layout';

/** Lists the local journal dir recursively, returning relPaths (excludes the
 * manifest file and any *.tmp scratch files from atomic writes). */
const listLocalRelPaths = async (dir: string): Promise<string[]> => {
  const out: string[] = [];
  const walk = async (abs: string, rel: string): Promise<void> => {
    let entries: import('fs').Dirent[];
    try {
      entries = await fs.readdir(abs, { withFileTypes: true });
    } catch {
      return; // dir does not exist yet
    }
    for (const e of entries) {
      const childRel = rel ? path.join(rel, e.name) : e.name;
      if (e.isDirectory()) {
        await walk(path.join(abs, e.name), childRel);
      } else if (e.name !== manifestRelName && !e.name.endsWith('.tmp')) {
        out.push(childRel);
      }
    }
  };
  await walk(dir, '');
  return out;
};

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
      console.warn(
        `[storage] Garage unreachable for ${userId}; serving stale local cache`,
        err
      );
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

  for (const obj of remote) {
    const rel = relPathFromKey(userId, obj.key);
    remoteRelSet.add(rel);
    nextManifest[rel] = obj.etag;
    const localAbs = path.join(dir, rel);
    const resolvedRoot = path.resolve(dir) + path.sep;
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
    await fs.mkdir(path.dirname(localAbs), { recursive: true });
    await fs.writeFile(localAbs, body);
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
