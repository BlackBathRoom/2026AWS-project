export interface StorageProvider {
  createUploadTarget(input: { organizationId: string; ownerId: string; filename: string; mimeType: string; size: number }): Promise<{ fileId: string; storageKey: string; uploadUrl: string; expiresAt: string }>;
  completeUpload(fileId: string, checksum: string): Promise<{ scanStatus: 'pending' | 'clean' | 'rejected' }>;
  createDownloadTarget(storageKey: string): Promise<{ url: string; expiresAt: string }>;
  deleteObject(storageKey: string): Promise<void>;
}

import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export class S3StorageProvider implements StorageProvider {
  constructor(private readonly bucket: string, private readonly s3 = new S3Client({})) {}

  async createUploadTarget(input: { organizationId: string; ownerId: string; filename: string; mimeType: string; size: number }) {
    const fileId = `file-${crypto.randomUUID()}`;
    const storageKey = `${input.organizationId}/${input.ownerId}/${fileId}/${input.filename.replace(/[^A-Za-z0-9._-]/g, '_')}`;
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const url = await getSignedUrl(this.s3, new PutObjectCommand({ Bucket: this.bucket, Key: storageKey, ContentType: input.mimeType, ContentLength: input.size, ServerSideEncryption: 'AES256' }), { expiresIn: 300 });
    return { fileId, storageKey, uploadUrl: url, expiresAt };
  }

  async completeUpload(fileId: string, checksum: string) {
    if (!fileId || !checksum) return { scanStatus: 'rejected' as const };
    return { scanStatus: 'pending' as const };
  }

  async createDownloadTarget(storageKey: string) { const url = await getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.bucket, Key: storageKey }), { expiresIn: 60 }); return { url, expiresAt: new Date(Date.now() + 60 * 1000).toISOString() }; }
  async deleteObject(storageKey: string) { await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: storageKey })); }
}