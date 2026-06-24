import { createHash } from 'crypto';
import type { GetResult, ObjectMeta, ObjectStore } from './objectStore';

const sha256 = (body: Buffer): string =>
  createHash('sha256').update(body).digest('hex');

/** In-memory ObjectStore for tests and no-infra dev. ETag = sha256(body). */
export class MemoryObjectStore implements ObjectStore {
  private readonly objects = new Map<string, Buffer>();

  async list(prefix: string): Promise<ObjectMeta[]> {
    const out: ObjectMeta[] = [];
    for (const [key, body] of this.objects) {
      if (key.startsWith(prefix)) {
        out.push({ key, etag: sha256(body), size: body.length });
      }
    }
    return out;
  }

  async get(key: string): Promise<GetResult> {
    const body = this.objects.get(key);
    if (!body) throw new Error(`MemoryObjectStore: missing key ${key}`);
    return { body, etag: sha256(body) };
  }

  async put(key: string, body: Buffer): Promise<{ etag: string }> {
    this.objects.set(key, Buffer.from(body));
    return { etag: sha256(body) };
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }

  async deletePrefix(prefix: string): Promise<void> {
    for (const key of [...this.objects.keys()]) {
      if (key.startsWith(prefix)) this.objects.delete(key);
    }
  }
}
