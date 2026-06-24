import type { GetResult, ObjectMeta, ObjectStore } from './objectStore';
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';

const stripQuotes = (etag: string | undefined): string =>
  (etag ?? '').replace(/^"|"$/g, '');

/** Garage / S3-compatible ObjectStore. ETag is the server's (md5-based) header. */
export class S3ObjectStore implements ObjectStore {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string
  ) {}

  async list(prefix: string): Promise<ObjectMeta[]> {
    const out: ObjectMeta[] = [];
    let token: string | undefined;
    do {
      const res = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: token,
        })
      );
      for (const obj of res.Contents ?? []) {
        out.push({
          key: obj.Key!,
          etag: stripQuotes(obj.ETag),
          size: obj.Size ?? 0,
        });
      }
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    return out;
  }

  async get(key: string): Promise<GetResult> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key })
    );
    const body = Buffer.from(await res.Body!.transformToByteArray());
    return { body, etag: stripQuotes(res.ETag) };
  }

  async put(key: string, body: Buffer): Promise<{ etag: string }> {
    const res = await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body })
    );
    return { etag: stripQuotes(res.ETag) };
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key })
    );
  }

  async deletePrefix(prefix: string): Promise<void> {
    const entries = await this.list(prefix);
    if (entries.length === 0) return;
    await this.client.send(
      new DeleteObjectsCommand({
        Bucket: this.bucket,
        Delete: { Objects: entries.map((e) => ({ Key: e.key })) },
      })
    );
  }
}
