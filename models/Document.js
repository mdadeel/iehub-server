import mongoose from 'mongoose';

export const DOCUMENT_TYPES = [
    'BillOfLading',
    'CommercialInvoice',
    'PackingList',
    'CertificateOfOrigin',
    'PhytosanitaryCertificate',
    'InspectionCertificate',
    'InsuranceCertificate',
    'CustomsDeclaration',
    'ExportLicense',
    'Other',
];

export const ALLOWED_MIME_TYPES = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

const documentSchema = new mongoose.Schema({
    organizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: true,
        index: true,
    },
    tradeRecordId: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: 'tradeRecordModel',
        default: null,
        index: true,
    },
    tradeRecordModel: {
        type: String,
        enum: ['Import', 'RFQ', 'Shipment', 'Dispute', 'Product'],
        default: 'Import',
    },
    documentType: {
        type: String,
        enum: DOCUMENT_TYPES,
        required: true,
        index: true,
    },
    fileName: {
        type: String,
        required: true,
        trim: true,
    },
    mimeType: {
        type: String,
        enum: ALLOWED_MIME_TYPES,
        required: true,
    },
    fileSizeBytes: {
        type: Number,
        required: true,
        max: 25 * 1024 * 1024, // 25MB max limit
    },
    storageKey: {
        type: String,
        required: true,
        unique: true,
        index: true,
    },
    storageProvider: {
        type: String,
        enum: ['s3', 'r2', 'local'],
        default: 'local',
    },
    version: {
        type: Number,
        default: 1,
    },
    status: {
        type: String,
        enum: ['PendingUpload', 'Uploaded', 'Verified', 'Rejected', 'Expired'],
        default: 'PendingUpload',
        index: true,
    },
    uploadedByUserId: {
        type: String,
        required: true,
        index: true,
    },
    uploadedByEmail: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
    },
    verifiedByEmail: {
        type: String,
        default: null,
    },
    verifiedAt: {
        type: Date,
        default: null,
    },
    verificationNotes: {
        type: String,
        default: '',
    },
    expiresAt: {
        type: Date,
        default: null,
    },
    metadata: {
        customsReference: { type: String, default: '' },
        issuer: { type: String, default: '' },
        issueDate: { type: Date, default: null },
        checksumSha256: { type: String, default: '' },
    },
    deletedAt: {
        type: Date,
        default: null,
        index: true,
    },
}, { timestamps: true });

// Compound indexes for fast tenant filtering
documentSchema.index({ organizationId: 1, documentType: 1 });
documentSchema.index({ organizationId: 1, tradeRecordId: 1 });
documentSchema.index({ organizationId: 1, status: 1 });

const Document = mongoose.model('Document', documentSchema);

export default Document;
