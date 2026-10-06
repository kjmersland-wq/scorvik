import { createReadStream } from "node:fs";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export interface StoredVideo {
  body: NodeJS.ReadableStream;
  contentLength?: number;
  contentRange?: string;
}

export interface VideoObjectStorage {
  putFile(key: string, filePath: string): Promise<void>;
  getObject(key: string, range?: string): Promise<StoredVideo>;
  deleteObject(key: string): Promise<void>;
}

export class R2VideoObjectStorage implements VideoObjectStorage {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: {
    accountId: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
  }) {
    if (!config.accountId || !config.accessKeyId || !config.secretAccessKey || !config.bucket) {
      throw new Error("R2 account, credentials, and bucket configuration are required.");
    }
    this.client = new S3Client({
      region: "auto",
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
    this.bucket = config.bucket;
  }

  async putFile(key: string, filePath: string): Promise<void> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: createReadStream(filePath),
      ContentType: "video/mp4",
      CacheControl: "private, no-store",
    }));
  }

  async getObject(key: string, range?: string): Promise<StoredVideo> {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key, Range: range }));
    if (!result.Body || !("pipe" in result.Body) || typeof result.Body.pipe !== "function") throw new Error("R2 returned an unreadable MP4 object.");
    return {
      body: result.Body as NodeJS.ReadableStream,
      contentLength: result.ContentLength,
      contentRange: result.ContentRange,
    };
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}