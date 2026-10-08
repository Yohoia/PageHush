import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeWebReadableStream } from 'node:stream/web';
import type { BucketLocationConstraint } from '@aws-sdk/client-s3';
import type { StorageConfig } from '../config.js';

export interface PutAssetInput {
  key: string;
  body: Buffer;
  contentType: string;
}

export interface MinIOObject {
  body: Readable;
  contentType?: string;
  contentLength?: number;
  etag?: string;
  lastModified?: Date;
}

export class MinIOStorage {
  readonly #client: S3Client;
  readonly #config: StorageConfig;

  constructor(config: StorageConfig) {
    this.#config = config;
    this.#client = new S3Client({
      region: config.region ?? 'us-east-1',
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKey,
        secretAccessKey: config.secretKey,
      },
    });
  }

  get bucket() {
    return this.#config.bucket;
  }

  async ensureBucket() {
    try {
      await this.#client.send(new HeadBucketCommand({ Bucket: this.#config.bucket }));
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } } | null)?.$metadata
        ?.httpStatusCode;
      if (status !== 404 && status !== 400) throw error;

      await this.#client.send(
        new CreateBucketCommand({
          Bucket: this.#config.bucket,
          CreateBucketConfiguration: this.#config.region
            ? { LocationConstraint: this.#config.region as BucketLocationConstraint }
            : undefined,
        }),
      );
    }
  }

  async putObject({ key, body, contentType }: PutAssetInput) {
    const result = await this.#client.send(
      new PutObjectCommand({
        Bucket: this.#config.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    return {
      etag: result.ETag,
    };
  }

  async getObject(key: string): Promise<MinIOObject> {
    const result = await this.#client.send(
      new GetObjectCommand({ Bucket: this.#config.bucket, Key: key }),
    );

    if (!(result.Body instanceof Object) || !('transformToWebStream' in result.Body)) {
      throw new Error('MinIO returned an unsupported response body');
    }

    return {
      body: Readable.fromWeb(result.Body.transformToWebStream() as NodeWebReadableStream),
      contentType: result.ContentType,
      contentLength: result.ContentLength,
      etag: result.ETag,
      lastModified: result.LastModified,
    };
  }

  async health() {
    await this.#client.send(new HeadBucketCommand({ Bucket: this.#config.bucket }));
  }

  async close() {
    this.#client.destroy();
  }
}
