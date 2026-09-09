import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema({
    actorEmail: {
        type: String,
        required: true,
        index: true,
    },
    action: {
        type: String,
        required: true, // e.g. 'LISTING_VERIFIED', 'LISTING_REJECTED', 'PO_ISSUED', 'PO_CANCELLED'
        index: true,
    },
    targetEntity: {
        type: String,
        required: true, // e.g. 'Product', 'Import', 'CompanyProfile'
    },
    targetId: {
        type: String,
        required: true,
    },
    details: {
        type: mongoose.Schema.Types.Mixed,
        default: {},
    },
    ipAddress: {
        type: String,
        default: '',
    },
}, { timestamps: true });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

export default AuditLog;
