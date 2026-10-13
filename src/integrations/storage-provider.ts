export interface StorageProvider {
  createUploadTarget(input: { organizationId: string; ownerId: string; filename: string; mimeType: string; size: number }): Promise<{ fileId: string; storageKey: string; expiresAt: string }>;
  completeUpload(fileId: string, checksum: string): Promise<{ scanStatus: 'pending' | 'clean' | 'rejected' }>;
  createDownloadTarget(fileId: string): Promise<{ url: string; expiresAt: string }>;
  deleteObject(storageKey: string): Promise<void>;
}

import AWS from 'aws-sdk';

export class S3StorageProvider implements StorageProvider {
  constructor(private readonly bucket: string, private readonly s3 = new AWS.S3()) {}

  async createUploadTarget(input: { organizationId: string; ownerId: string; filename: string; mimeType: string; size: number }) {
    const fileId = `file-${crypto.randomUUID()}`;
    const storageKey = `${input.organizationId}/${input.ownerId}/${fileId}/${input.filename.replace(/[^A-Za-z0-9._-]/g, '_')}`;
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const url = this.s3.getSignedUrl('putObject', { Bucket: this.bucket, Key: storageKey, ContentType: input.mimeType, ServerSideEncryption: 'AES256', Expires: 300 });
    return { fileId, storageKey, expiresAt, url };
  }

  async completeUpload(fileId: string, checksum: string) { if (!fileId || !checksum) return { scanStatus: 'rejected' as const }; return { scanStatus: 'clean' as const }; }

  async createDownloadTarget(fileId: string) { const url = this.s3.getSignedUrl('getObject', { Bucket: this.bucket, Key: fileId, Expires: 60 }); return { url, expiresAt: new Date(Date.now() + 60 * 1000).toISOString() }; }
  async deleteObject(storageKey: string) { await this.s3.deleteObject({ Bucket: this.bucket, Key: storageKey }).promise(); }
}