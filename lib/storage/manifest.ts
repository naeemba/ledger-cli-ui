import { createHash, randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { getJournalDir } from '@/lib/journal/layout';

/** relPath (within the user's journal dir) → last-seen ETag. */
export type Manifest = Record<string, string>;

export const manifestRelName = '.manifest.json';

/** Garage key prefix for a user, e.g. `journals/<userId>/`. */
export const userPrefix = (userId: string): string => `journals/${userId}/`;

/** Full object key for a file inside the user's journal. POSIX separators. */
export const keyFor = (userId: string, relPath: string): string =>
  userPrefix(userId) + relPath.split(path.sep).join('/');

/** Inverse of keyFor: the relPath (OS separators) for a full key. Rejects keys
 * that would escape the user's journal dir (absolute or containing `..`). */
export const relPathFromKey = (userId: string, key: string): string => {
  const rel = key.slice(userPrefix(userId).length).split('/').join(path.sep);
  if (path.isAbsolute(rel) || /(^|[/\\])\.\.([/\\]|$)/.test(rel)) {
    throw new Error(`Unsafe journal object key: ${key}`);
  }
  return rel;
};

/** Absolute local cache path for a relPath inside the user's journal dir. */
export const localPathFor = (userId: string, relPath: string): string =>
  path.join(getJournalDir(userId), relPath);

const manifestPath = (userId: string): string =>
  path.join(getJournalDir(userId), manifestRelName);

export const readManifest = async (userId: string): Promise<Manifest> => {
  try {
    const raw = await fs.readFile(manifestPath(userId), 'utf-8');
    return JSON.parse(raw) as Manifest;
  } catch {
    return {};
  }
};

export const writeManifest = async (
  userId: string,
  m: Manifest
): Promise<void> => {
  await fs.mkdir(getJournalDir(userId), { recursive: true });
  // Atomic write (tmp + rename on the same filesystem) so a crash or a
  // concurrent reader never sees a half-written manifest — a torn manifest
  // would fail JSON.parse, reset to {}, and silently disable the conflict guard.
  const dest = manifestPath(userId);
  // Unique tmp name per write so concurrent writers never share (and rename
  // away) each other's scratch file — a fixed name races to ENOENT on rename.
  const tmp = `${dest}.${randomUUID()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(m, null, 2), 'utf-8');
  await fs.rename(tmp, dest);
};

/** Lists the local journal dir recursively, returning relPaths (excludes the
 * manifest file and any *.tmp scratch files from atomic writes). Returns an
 * empty list if the dir does not exist yet. */
export const listLocalRelPaths = async (dir: string): Promise<string[]> => {
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

/** Order-independent content fingerprint of a set of (key, etag) pairs. */
export const fingerprint = (
  entries: { key: string; etag: string }[]
): string => {
  const body = [...entries]
    .map((e) => `${e.key}:${e.etag}`)
    .sort()
    .join('\n');
  return createHash('sha256').update(body).digest('hex');
};
