import express from 'express';
import Document, { DOCUMENT_TYPES, ALLOWED_MIME_TYPES } from '../models/Document.js';
import AuditLog from '../models/AuditLog.js';
import storageService from '../services/storageService.js';
import { handleAsyncError, ApiError } from '../utils/errorHandler.js';
import { verifyAuth } from '../middleware/authMiddleware.js';
import { resolveOrg, requireOrg } from '../middleware/resolveOrg.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { dispatchWebhookEvent } from '../services/webhookService.js';

const router = express.Router();

// Mock storage buffer for development and testing
const devStorageBuffer = new Map();

// --- 1. LOCAL DEVELOPMENT STORAGE ENDPOINTS (Development / Sandbox only) ---
router.put('/mock-upload/:storageKey', (req, res) => {
    const key = decodeURIComponent(req.params.storageKey);
    devStorageBuffer.set(key, { uploadedAt: new Date(), size: req.headers['content-length'] || 1024 });
    res.status(200).send('Mock upload successful');
});

router.get('/mock-download/:storageKey', (req, res) => {
    const key = decodeURIComponent(req.params.storageKey);
    const filename = req.query.filename || 'document.pdf';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(Buffer.from(`%PDF-1.4 Mock Document Content for ${key}`));
});

// --- 2. AUTHENTICATED DOCUMENT VAULT ENDPOINTS ---

// GET /api/documents — List documents for the active organization
router.get('/', verifyAuth, resolveOrg, requireOrg, handleAsyncError(async (req, res) => {
    const { documentType, tradeRecordId, status } = req.query;
    const filter = {
        organizationId: req.orgId,
        deletedAt: null,
    };

    if (documentType && documentType !== 'All') {
        filter.documentType = documentType;
    }
    if (status && status !== 'All') {
        filter.status = status;
    }
    if (tradeRecordId) {
        filter.tradeRecordId = tradeRecordId;
    }

    const documents = await Document.find(filter).sort({ createdAt: -1 });
    res.json(documents);
}));

// GET /api/documents/:id — Get single document metadata
router.get('/:id', verifyAuth, resolveOrg, requireOrg, handleAsyncError(async (req, res) => {
    const doc = await Document.findById(req.params.id);
    if (!doc || doc.deletedAt) throw new ApiError('Document not found', 404);

    if (!doc.organizationId.equals(req.orgId) && !req.user.isAdmin) {
        throw new ApiError('Not authorized to access this document', 403);
    }

    res.json(doc);
}));

// POST /api/documents/presigned-upload — Initiate secure upload
router.post('/presigned-upload', verifyAuth, resolveOrg, requireOrg, handleAsyncError(async (req, res) => {
    const { fileName, mimeType, fileSizeBytes, documentType, tradeRecordId, tradeRecordModel, metadata } = req.body;

    if (!fileName || !mimeType || !fileSizeBytes || !documentType) {
        throw new ApiError('Missing required fields: fileName, mimeType, fileSizeBytes, documentType', 400);
    }

    if (!DOCUMENT_TYPES.includes(documentType)) {
        throw new ApiError(`Invalid documentType. Allowed: ${DOCUMENT_TYPES.join(', ')}`, 400);
    }

    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
        throw new ApiError(`Invalid file type. Allowed: PDF, PNG, JPEG, XLSX`, 400);
    }

    if (fileSizeBytes > 25 * 1024 * 1024) {
        throw new ApiError('File size exceeds the 25MB maximum limit', 400);
    }

    const { presignedPutUrl, storageKey, storageProvider, expiresAt } = await storageService.createPresignedUpload({
        organizationId: req.orgId,
        documentType,
        fileName,
        mimeType,
        fileSizeBytes,
        tradeRecordId,
        tradeRecordModel,
    });

    const doc = await Document.create({
        organizationId: req.orgId,
        tradeRecordId: tradeRecordId || null,
        tradeRecordModel: tradeRecordModel || 'Import',
        documentType,
        fileName,
        mimeType,
        fileSizeBytes,
        storageKey,
        storageProvider,
        status: 'PendingUpload',
        uploadedByUserId: req.user.uid,
        uploadedByEmail: req.user.email,
        metadata: metadata || {},
    });

    res.status(201).json({
        documentId: doc._id,
        presignedPutUrl,
        storageKey,
        expiresAt,
        document: doc,
    });
}));

// POST /api/documents/:id/confirm-upload — Mark upload complete
router.post('/:id/confirm-upload', verifyAuth, resolveOrg, requireOrg, handleAsyncError(async (req, res) => {
    const doc = await Document.findById(req.params.id);
    if (!doc || doc.deletedAt) throw new ApiError('Document not found', 404);

    if (!doc.organizationId.equals(req.orgId) && !req.user.isAdmin) {
        throw new ApiError('Not authorized to confirm this document', 403);
    }

    doc.status = 'Uploaded';
    await doc.save();

    AuditLog.create({
        orgId: req.orgId,
        actorEmail: req.user.email,
        action: 'DOCUMENT_UPLOADED',
        targetEntity: 'Document',
        targetId: String(doc._id),
        details: { fileName: doc.fileName, documentType: doc.documentType, storageKey: doc.storageKey },
        ipAddress: req.ip || '',
    }).catch(err => console.error('Audit log failed:', err));

    res.json(doc);
}));

// GET /api/documents/:id/download-url — Get secure time-limited download URL
router.get('/:id/download-url', verifyAuth, resolveOrg, requireOrg, handleAsyncError(async (req, res) => {
    const doc = await Document.findById(req.params.id);
    if (!doc || doc.deletedAt) throw new ApiError('Document not found', 404);

    if (!doc.organizationId.equals(req.orgId) && !req.user.isAdmin) {
        throw new ApiError('Not authorized to download this document for this organization', 403);
    }

    const { presignedGetUrl, expiresInSeconds, expiresAt } = await storageService.getPresignedDownload({
        storageKey: doc.storageKey,
        fileName: doc.fileName,
    });

    AuditLog.create({
        orgId: req.orgId,
        actorEmail: req.user.email,
        action: 'DOCUMENT_DOWNLOAD_ACCESSED',
        targetEntity: 'Document',
        targetId: String(doc._id),
        details: { fileName: doc.fileName, documentType: doc.documentType },
        ipAddress: req.ip || '',
    }).catch(err => console.error('Audit log failed:', err));

    res.json({
        presignedGetUrl,
        expiresInSeconds,
        expiresAt,
        fileName: doc.fileName,
        mimeType: doc.mimeType,
    });
}));

// PATCH /api/documents/:id/verify — Compliance/Admin document verification
router.patch('/:id/verify', verifyAuth, resolveOrg, requirePermission('document:verify'), handleAsyncError(async (req, res) => {
    const { status, verificationNotes } = req.body;

    if (!['Verified', 'Rejected'].includes(status)) {
        throw new ApiError('Status must be either Verified or Rejected', 400);
    }

    const doc = await Document.findById(req.params.id);
    if (!doc || doc.deletedAt) throw new ApiError('Document not found', 404);

    doc.status = status;
    doc.verifiedByEmail = req.user.email;
    doc.verifiedAt = new Date();
    doc.verificationNotes = verificationNotes || '';
    await doc.save();

    AuditLog.create({
        orgId: doc.organizationId,
        actorEmail: req.user.email,
        action: `DOCUMENT_${status.toUpperCase()}`,
        targetEntity: 'Document',
        targetId: String(doc._id),
        details: { status, verificationNotes, documentType: doc.documentType, fileName: doc.fileName },
        ipAddress: req.ip || '',
    }).catch(err => console.error('Audit log failed:', err));

    if (status === 'Verified' && doc.organizationId) {
        dispatchWebhookEvent(doc.organizationId, 'document.verified', {
            documentId: doc._id,
            fileName: doc.fileName,
            documentType: doc.documentType,
            verifiedAt: doc.verifiedAt,
        });
    }

    res.json(doc);
}));

// DELETE /api/documents/:id — Soft-delete document
router.delete('/:id', verifyAuth, resolveOrg, requireOrg, handleAsyncError(async (req, res) => {
    const doc = await Document.findById(req.params.id);
    if (!doc || doc.deletedAt) throw new ApiError('Document not found', 404);

    if (!doc.organizationId.equals(req.orgId) && !req.user.isAdmin) {
        throw new ApiError('Not authorized to delete this document', 403);
    }

    doc.deletedAt = new Date();
    await doc.save();

    res.json({ message: 'Document removed successfully' });
}));

export default router;
