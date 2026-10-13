export interface StorageProvider {
  createUploadTarget(input: { organizationId: string; ownerId: string; filename: string; mimeType: string; size: number }): Promise<{ fileId: string; storageKey: string; expiresAt: string }>;
  completeUpload(fileId: string, checksum: string): Promise<{ scanStatus: 'pending' | 'clean' | 'rejected' }>;
  createDownloadTarget(fileId: string): Promise<{ url: string; expiresAt: string }>;
  deleteObject(storageKey: string): Promise<void>;
}

// AWS implementation: S3 private bucket, server-side encryption, short-lived signed URL.