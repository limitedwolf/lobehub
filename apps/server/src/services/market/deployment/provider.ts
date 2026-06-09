import { S3 } from '@/server/modules/S3';

export interface MarketDeploymentProvider {
  deleteHtml: (key: string) => Promise<void>;
  putHtml: (key: string, html: string) => Promise<void>;
}

export interface CloudflareR2WorkerConfig {
  accessKeyId: string;
  accountId: string;
  bucket: string;
  secretAccessKey: string;
}

export class CloudflareR2WorkerProvider implements MarketDeploymentProvider {
  private readonly s3: S3;

  constructor(config: CloudflareR2WorkerConfig) {
    this.s3 = new S3(
      config.accessKeyId,
      config.secretAccessKey,
      `https://${config.accountId}.r2.cloudflarestorage.com`,
      {
        bucket: config.bucket,
        region: 'auto',
      },
    );
  }

  deleteHtml = async (key: string) => {
    await this.s3.deleteFile(key);
  };

  putHtml = async (key: string, html: string) => {
    await this.s3.uploadBuffer(
      key,
      Buffer.from(html, 'utf8'),
      'text/html; charset=utf-8',
      'public, max-age=60',
    );
  };
}
