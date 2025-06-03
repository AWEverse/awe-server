import { S3Client, S3ClientConfig } from '@aws-sdk/client-s3';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class R2ClientService {
  private readonly logger = new Logger(R2ClientService.name);
  private readonly s3Client: S3Client;

  constructor(private readonly configService: ConfigService) {
    const config: S3ClientConfig = {
      region: this.configService.get<string>('R2_REGION', 'auto'),
      endpoint: this.configService.get<string>('R2_ENDPOINT'),
      credentials: {
        accessKeyId: this.configService.get<string>('R2_ACCESS_KEY_ID')!,
        secretAccessKey: this.configService.get<string>('R2_SECRET_ACCESS_KEY')!,
      },
      forcePathStyle: true, // Required for R2
    };

    this.s3Client = new S3Client(config);
    this.logger.log('R2 Client initialized');
  }

  getClient(): S3Client {
    return this.s3Client;
  }

  getBucketName(bucketType: string): string {
    const bucketMap = {
      avatars: this.configService.get<string>('R2_BUCKET_AVATARS'),
      documents: this.configService.get<string>('R2_BUCKET_DOCS'),
      videos: this.configService.get<string>('R2_BUCKET_VIDEOS'),
      images: this.configService.get<string>('R2_BUCKET_IMAGES'),
    };

    return bucketMap[bucketType] || bucketType;
  }

  getPublicUrl(bucket: string, key: string): string {
    const endpoint = this.configService.get<string>('R2_ENDPOINT');

    if (!endpoint) {
      throw new Error('R2_ENDPOINT is not defined');
    }

    const domain = endpoint.replace(/https?:\/\//, '');
    return `https://${domain}/${bucket}/${key}`;
  }
}
