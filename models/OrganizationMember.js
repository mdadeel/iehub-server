import mongoose from 'mongoose';

const organizationMemberSchema = new mongoose.Schema({
    orgId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: true,
        index: true,
    },
    userId: {
        type: String,
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
        enum: ['Owner', 'Admin', 'Manager', 'Agent', 'Viewer'],
        default: 'Agent',
    },
    tradeRoles: [{
        type: String,
        enum: ['ProcurementManager', 'ProcurementAgent', 'ExportManager', 'InventoryManager', 'LogisticsCoordinator', 'FinanceController', 'ComplianceOfficer'],
    }],
    status: {
        type: String,
        enum: ['Active', 'Invited', 'Suspended'],
        default: 'Active',
        index: true,
    },
    invitedBy: { type: String, default: '' },
    joinedAt: { type: Date, default: Date.now },
    lastActiveAt: Date,
}, { timestamps: true });

organizationMemberSchema.index({ orgId: 1, userId: 1 }, { unique: true });
organizationMemberSchema.index({ orgId: 1, email: 1 }, { unique: true });

const OrganizationMember = mongoose.model('OrganizationMember', organizationMemberSchema);
export default OrganizationMember;
