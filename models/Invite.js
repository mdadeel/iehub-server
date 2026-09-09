import mongoose from 'mongoose';
import crypto from 'crypto';

const inviteSchema = new mongoose.Schema({
    orgId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: true,
        index: true,
    },
    email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
        index: true,
    },
    orgRole: {
        type: String,
        enum: ['Admin', 'Manager', 'Agent', 'Viewer'],
        default: 'Agent',
    },
    tradeRoles: [{
        type: String,
        enum: ['ProcurementManager', 'ProcurementAgent', 'ExportManager', 'InventoryManager', 'LogisticsCoordinator', 'FinanceController', 'ComplianceOfficer'],
    }],
    token: {
        type: String,
        unique: true,
        index: true,
        default: () => crypto.randomBytes(24).toString('hex'),
    },
    invitedBy: { type: String, default: '' },
    status: {
        type: String,
        enum: ['Pending', 'Accepted', 'Revoked', 'Expired'],
        default: 'Pending',
        index: true,
    },
    expiresAt: {
        type: Date,
        default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        index: true,
    },
}, { timestamps: true });

const Invite = mongoose.model('Invite', inviteSchema);
export default Invite;
