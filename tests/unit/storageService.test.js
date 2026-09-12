import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import storageService, { getStorageProvider } from '../../services/storageService.js';

describe('Storage Service Unit Tests', () => {
    const orgId = new mongoose.Types.ObjectId().toString();

    it('getStorageProvider should return LocalDevStorageProvider when S3 env is not set', () => {
        const provider = getStorageProvider();
        assert.equal(provider.name, 'local');
    });

    it('createPresignedUpload generates partitioned key, sanitizes filename, and creates signed URL', async () => {
        const result = await storageService.createPresignedUpload({
            organizationId: orgId,
            documentType: 'BillOfLading',
            fileName: 'Test Invoice #1 @Port.pdf',
            mimeType: 'application/pdf',
            fileSizeBytes: 1024 * 50,
        });

        assert.ok(result.presignedPutUrl, 'Must return presigned PUT URL');
        assert.ok(result.storageKey, 'Must return storageKey');
        assert.equal(result.storageProvider, 'local');
        assert.ok(result.expiresAt instanceof Date);

        // Verify key partition: org_<orgId>/billoflading_<hash>_<sanitizedName>
        assert.match(result.storageKey, new RegExp(`^org_${orgId}/billoflading_[a-f0-9]+_Test_Invoice__1__Port\\.pdf$`));

        // Verify URL has HMAC signature and expiry parameter
        assert.match(result.presignedPutUrl, /sig=[a-f0-9]{64}/);
        assert.match(result.presignedPutUrl, /exp=\d+/);
    });

    it('getPresignedDownload generates valid download URL with 5-minute expiry', async () => {
        const storageKey = `org_${orgId}/invoice_123456_export.pdf`;
        const fileName = 'Export Bill.pdf';

        const result = await storageService.getPresignedDownload({
            storageKey,
            fileName,
        });

        assert.ok(result.presignedGetUrl, 'Must return presigned GET URL');
        assert.equal(result.expiresInSeconds, 300);
        assert.ok(result.expiresAt instanceof Date);

        // Verify URL contains filename and signature
        assert.match(result.presignedGetUrl, /sig=[a-f0-9]{64}/);
        assert.match(result.presignedGetUrl, /filename=Export%20Bill\.pdf/);
    });
});
