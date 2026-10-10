import type { Readable } from 'node:stream';

export interface PutAssetInput {
  key: string;
  body: Buffer;
  contentType: string;
}

export interface StoredObject {
  body: Readable;
  contentType?: string;
  contentLength?: number;
  etag?: string;
  lastModified?: Date;
}

/**
 * Seam for binary asset storage. Production runs MinIO; tests run an in-memory
 * adapter implementing the same interface. Publishing will use copyObject to
 * materialize a public snapshot from the private drafts/ prefix.
 */
export interface StoragePort {
  readonly bucket: string;
  ensureBucket(): Promise<void>;
  putObject(input: PutAssetInput): Promise<{ etag?: string }>;
  getObject(key: string): Promise<StoredObject>;
  copyObject(sourceKey: string, destinationKey: string): Promise<void>;
  deleteObject(key: string): Promise<void>;
  health(): Promise<void>;
  close(): void;
}
