import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Env } from '../env.js';

export interface AssetStorage {
  presignPut: (args: {
    key: string;
    contentType: string;
    sizeBytes: number;
    expiresInSeconds?: number;
  }) => Promise<{ url: string; headers: Record<string, string> }>;
  presignGet: (args: { key: string; expiresInSeconds?: number }) => Promise<string>;
  head: (key: string) => Promise<{ exists: boolean; sizeBytes: number | null }>;
  delete: (key: string) => Promise<void>;
  bucket: string;
}

export function createAssetStorage(env: Env): AssetStorage | null {
  if (!env.S3_BUCKET || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
    return null;
  }
  const client = new S3Client({
    region: env.S3_REGION,
    ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT } : {}),
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
  });
  const bucket = env.S3_BUCKET;

  return {
    bucket,
    async presignPut({ key, contentType, sizeBytes, expiresInSeconds = 300 }) {
      const cmd = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
        ContentLength: sizeBytes,
      });
      const url = await getSignedUrl(client, cmd, { expiresIn: expiresInSeconds });
      // The signed URL embeds the Content-Type; the client must echo it
      // on the PUT or S3 rejects with SignatureDoesNotMatch.
      return {
        url,
        headers: { 'Content-Type': contentType },
      };
    },
    async presignGet({ key, expiresInSeconds = 600 }) {
      const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
      return getSignedUrl(client, cmd, { expiresIn: expiresInSeconds });
    },
    async head(key) {
      try {
        const res = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return { exists: true, sizeBytes: res.ContentLength ?? null };
      } catch (err) {
        if ((err as { name?: string }).name === 'NotFound') {
          return { exists: false, sizeBytes: null };
        }
        throw err;
      }
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
  };
}
