/** Metadata for one stored object. `etag` is opaque and backend-specific. */
export type ObjectMeta = { key: string; etag: string; size: number };

/** Result of fetching an object's bytes. */
export type GetResult = { body: Buffer; etag: string };

/**
 * Minimal S3-shaped object store. Implementations: S3ObjectStore (Garage) and
 * MemoryObjectStore (tests/dev). Keys are full paths like
 * `journals/<userId>/main.ledger`. Conflict detection is done by the sync layer
 * (comparing ETags), not here.
 */
export interface ObjectStore {
  /** Lists every object whose key starts with `prefix`. */
  list(prefix: string): Promise<ObjectMeta[]>;
  /** Fetches one object. Rejects if the key does not exist. */
  get(key: string): Promise<GetResult>;
  /** Writes one object, returning its new ETag. */
  put(key: string, body: Buffer): Promise<{ etag: string }>;
  /** Deletes one object. No-op if it does not exist. */
  delete(key: string): Promise<void>;
  /** Deletes every object under `prefix`. */
  deletePrefix(prefix: string): Promise<void>;
}
