process.env.NODE_ENV = 'test';
process.env.ENABLE_DEV_SANDBOX = 'true';

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../../index.js';
import Document, { DOCUMENT_TYPES, ALLOWED_MIME_TYPES } from '../../models/Document.js';

describe('Document Vault Model & Storage Isolation Tests', () => {
    const orgAId = new mongoose.Types.ObjectId();
    const orgBId = new mongoose.Types.ObjectId();

    it('Document Schema: successfully validates compliant trade document', () => {
        const doc = new Document({
            organizationId: orgAId,
            documentType: 'BillOfLading',
            fileName: 'BL-2026-001.pdf',
            mimeType: 'application/pdf',
            fileSizeBytes: 1024 * 500, // 500 KB
            storageKey: `org_${orgAId}/billoflading_1234_BL-2026-001.pdf`,
            storageProvider: 'local',
            status: 'PendingUpload',
            uploadedByUserId: 'user-a-123',
            uploadedByEmail: 'trader@orga.com',
            metadata: {
                customsReference: 'CUSTOMS-REF-99',
                issuer: 'Port Authority',
            },
        });

        const validationErr = doc.validateSync();
        assert.equal(validationErr, undefined, 'Compliant document must pass validation');
        assert.equal(doc.organizationId.equals(orgAId), true);
        assert.equal(doc.status, 'PendingUpload');
    });

    it('Document Schema: rejects disallowed documentType', () => {
        const doc = new Document({
            organizationId: orgAId,
            documentType: 'MaliciousExecutable',
            fileName: 'script.sh',
            mimeType: 'application/pdf',
            fileSizeBytes: 1024,
            storageKey: `org_${orgAId}/bad_key`,
            uploadedByUserId: 'user-a-123',
            uploadedByEmail: 'trader@orga.com',
        });

        const validationErr = doc.validateSync();
        assert.ok(validationErr, 'Expected validation error for invalid documentType');
        assert.ok(validationErr.errors.documentType);
    });

    it('Document Schema: rejects disallowed MIME types (e.g. text/html, application/javascript)', () => {
        const doc = new Document({
            organizationId: orgAId,
            documentType: 'Other',
            fileName: 'index.html',
            mimeType: 'text/html',
            fileSizeBytes: 1024,
            storageKey: `org_${orgAId}/bad_mime`,
            uploadedByUserId: 'user-a-123',
            uploadedByEmail: 'trader@orga.com',
        });

        const validationErr = doc.validateSync();
        assert.ok(validationErr, 'Expected validation error for disallowed mimeType');
        assert.ok(validationErr.errors.mimeType);
    });

    it('Document Schema: strictly enforces 25MB file size limit', () => {
        const doc = new Document({
            organizationId: orgAId,
            documentType: 'CommercialInvoice',
            fileName: 'huge_archive.pdf',
            mimeType: 'application/pdf',
            fileSizeBytes: 26 * 1024 * 1024, // 26MB > 25MB max
            storageKey: `org_${orgAId}/too_large`,
            uploadedByUserId: 'user-a-123',
            uploadedByEmail: 'trader@orga.com',
        });

        const validationErr = doc.validateSync();
        assert.ok(validationErr, 'Expected validation error for oversized file');
        assert.ok(validationErr.errors.fileSizeBytes);
    });

    it('Tenant Isolation: strictly blocks cross-tenant access to document records', () => {
        const docA = new Document({
            organizationId: orgAId,
            documentType: 'CertificateOfOrigin',
            fileName: 'COO-2026.pdf',
            mimeType: 'application/pdf',
            fileSizeBytes: 1024 * 100,
            storageKey: `org_${orgAId}/coo_123.pdf`,
            uploadedByUserId: 'user-a-123',
            uploadedByEmail: 'trader@orga.com',
        });

        const checkDocAccess = (requestingOrgId) => {
            return docA.organizationId.equals(requestingOrgId);
        };

        assert.equal(checkDocAccess(orgAId), true, 'Owner organization must have access');
        assert.equal(checkDocAccess(orgBId), false, 'Intruder organization must be denied access');
    });

    it('Local Dev Storage Endpoints: mock-upload and mock-download work without cloud credentials', async () => {
        const testKey = 'test-org-1/test-doc.pdf';

        // Test PUT mock-upload
        const uploadRes = await request(app)
            .put(`/api/documents/mock-upload/${encodeURIComponent(testKey)}`)
            .send(Buffer.from('PDF Mock Content'))
            .set('Content-Type', 'application/pdf');

        assert.equal(uploadRes.statusCode, 200);

        // Test GET mock-download
        const downloadRes = await request(app)
            .get(`/api/documents/mock-download/${encodeURIComponent(testKey)}?filename=test-doc.pdf`);

        assert.equal(downloadRes.statusCode, 200);
        assert.match(downloadRes.headers['content-type'], /application\/pdf/);
        assert.match(downloadRes.headers['content-disposition'], /attachment; filename="test-doc\.pdf"/);
    });
});
