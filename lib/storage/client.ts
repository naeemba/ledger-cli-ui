import { MemoryObjectStore } from './memoryObjectStore';
import type { ObjectStore } from './objectStore';
import { S3ObjectStore } from './s3ObjectStore';
import { env } from '@/lib/env';
import { S3Client } from '@aws-sdk/client-s3';

let cached: ObjectStore | null = null;

const buildS3Store = (): ObjectStore => {
  const client = new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID!,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
    },
  });
  return new S3ObjectStore(client, env.S3_BUCKET!);
};

/** Returns the process-wide ObjectStore, building it from env on first call. */
export const getObjectStore = (): ObjectStore => {
  if (cached) return cached;
  cached =
    env.STORAGE_BACKEND === 's3' ? buildS3Store() : new MemoryObjectStore();
  return cached;
};

/** Test-only: drop the memoized store so the next getObjectStore() rebuilds. */
export const resetObjectStore = (): void => {
  cached = null;
};
