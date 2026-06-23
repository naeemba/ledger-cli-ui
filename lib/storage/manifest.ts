import { createHash } from 'crypto';
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

/** Inverse of keyFor: the relPath (OS separators) for a full key. */
export const relPathFromKey = (userId: string, key: string): string =>
  key.slice(userPrefix(userId).length).split('/').join(path.sep);

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
  await fs.writeFile(manifestPath(userId), JSON.stringify(m, null, 2), 'utf-8');
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
