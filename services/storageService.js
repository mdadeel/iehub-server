import crypto from 'node:crypto';
import logger from '../utils/logger.js';

const SIGNING_SECRET = process.env.STORAGE_SIGNING_SECRET || 'dev-storage-signing-secret-iehub-2026';

/**
 * Storage Provider Interface & Implementations
 */

/**
 * Local Development Storage Provider (Zero external credentials required)
 * Generates HMAC-signed presigned URLs for local development and CI environments.
 * Clearly designated for development and automated testing only.
 */
class LocalDevStorageProvider {
    constructor() {
        this.name = 'local';
    }

    async getPresignedUploadUrl({ storageKey, mimeType, fileSizeBytes }) {
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
        const payload = `${storageKey}:${mimeType}:${fileSizeBytes}:${expiresAt.getTime()}`;
        const signature = crypto.createHmac('sha256', SIGNING_SECRET).update(payload).digest('hex');

        const baseUrl = process.env.CLIENT_URL?.split(',')[0] || 'http://localhost:5000';
        const presignedPutUrl = `${baseUrl}/api/documents/mock-upload/${encodeURIComponent(storageKey)}?sig=${signature}&exp=${expiresAt.getTime()}`;

        return {
            presignedPutUrl,
            storageKey,
            storageProvider: this.name,
            expiresAt,
        };
    }

    async getPresignedDownloadUrl({ storageKey, fileName }) {
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
        const payload = `${storageKey}:${fileName}:${expiresAt.getTime()}`;
        const signature = crypto.createHmac('sha256', SIGNING_SECRET).update(payload).digest('hex');

        const baseUrl = process.env.CLIENT_URL?.split(',')[0] || 'http://localhost:5000';
        const presignedGetUrl = `${baseUrl}/api/documents/mock-download/${encodeURIComponent(storageKey)}?sig=${signature}&exp=${expiresAt.getTime()}&filename=${encodeURIComponent(fileName)}`;

        return {
            presignedGetUrl,
            expiresInSeconds: 300,
            expiresAt,
        };
    }

    async deleteFile({ storageKey }) {
        logger.debug(`[LocalDevStorage] Deleted file with key: ${storageKey}`);
        return true;
    }
}

/**
 * AWS S3 / Cloudflare R2 Production Storage Provider
 */
class S3StorageProvider {
    constructor() {
        this.name = 's3';
        this.bucket = process.env.S3_BUCKET_NAME || 'iehub-documents';
    }

    async getPresignedUploadUrl({ storageKey, mimeType }) {
        // Dynamic import to prevent AWS SDK requirement in environments where S3 is not enabled
        const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
        const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');

        const s3 = new S3Client({
            region: process.env.AWS_REGION || 'auto',
            endpoint: process.env.S3_ENDPOINT || undefined,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
            },
        });

        const command = new PutObjectCommand({
            Bucket: this.bucket,
            Key: storageKey,
            ContentType: mimeType,
        });

        const presignedPutUrl = await getSignedUrl(s3, command, { expiresIn: 900 }); // 15 mins
        const expiresAt = new Date(Date.now() + 900 * 1000);

        return {
            presignedPutUrl,
            storageKey,
            storageProvider: this.name,
            expiresAt,
        };
    }

    async getPresignedDownloadUrl({ storageKey, fileName }) {
        const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
        const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');

        const s3 = new S3Client({
            region: process.env.AWS_REGION || 'auto',
            endpoint: process.env.S3_ENDPOINT || undefined,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
            },
        });

        const command = new GetObjectCommand({
            Bucket: this.bucket,
            Key: storageKey,
            ResponseContentDisposition: `attachment; filename="${encodeURIComponent(fileName)}"`,
        });

        const presignedGetUrl = await getSignedUrl(s3, command, { expiresIn: 300 }); // 5 mins
        return {
            presignedGetUrl,
            expiresInSeconds: 300,
            expiresAt: new Date(Date.now() + 300 * 1000),
        };
    }

    async deleteFile({ storageKey }) {
        const { S3Client, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
        const s3 = new S3Client({
            region: process.env.AWS_REGION || 'auto',
            endpoint: process.env.S3_ENDPOINT || undefined,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
            },
        });

        await s3.send(new DeleteObjectCommand({
            Bucket: this.bucket,
            Key: storageKey,
        }));
        return true;
    }
}

// Provider Factory
export function getStorageProvider() {
    if (process.env.S3_BUCKET_NAME && process.env.AWS_ACCESS_KEY_ID) {
        return new S3StorageProvider();
    }
    return new LocalDevStorageProvider();
}

export const storageService = {
    async createPresignedUpload({ organizationId, documentType, fileName, mimeType, fileSizeBytes, tradeRecordId, tradeRecordModel }) {
        const provider = getStorageProvider();
        const shortId = crypto.randomBytes(6).toString('hex');
        const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
        const storageKey = `org_${organizationId}/${documentType.toLowerCase()}_${shortId}_${sanitizedFileName}`;

        return provider.getPresignedUploadUrl({ storageKey, mimeType, fileSizeBytes });
    },

    async getPresignedDownload({ storageKey, fileName }) {
        const provider = getStorageProvider();
        return provider.getPresignedDownloadUrl({ storageKey, fileName });
    },

    async deleteFile({ storageKey }) {
        const provider = getStorageProvider();
        return provider.deleteFile({ storageKey });
    },
};

export default storageService;
