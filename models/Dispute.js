import mongoose from 'mongoose';

const disputeSchema = new mongoose.Schema({
    // Mandatory Organization Tenancy (Bilateral)
    organizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        default: null,
        index: true,
    },
    claimantOrganizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        default: null,
        index: true,
    },
    respondentOrganizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        default: null,
        index: true,
    },
    orgId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        default: null,
        index: true,
        sparse: true,
    },
    createdByUserId: {
        type: String,
        default: '',
        index: true,
    },
    disputeNumber: {
        type: String,
        required: true,
        unique: true,
        index: true,
    },
    importId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Import',
        required: true,
        index: true,
    },
    poNumber: {
        type: String,
        required: true,
        index: true,
    },
    claimantEmail: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
        index: true,
    },
    respondentEmail: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
        index: true,
    },
    reason: {
        type: String,
        required: true,
        trim: true,
    },
    claimAmount: {
        type: Number,
        default: 0,
        min: 0,
    },
    evidenceNotes: {
        type: String,
        required: true,
    },
    evidenceDocumentIds: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Document',
    }],
    counterEvidenceNotes: {
        type: String,
        default: '',
    },
    counterEvidenceDocumentIds: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Document',
    }],
    status: {
        type: String,
        enum: ['Open', 'UnderReview', 'Resolved', 'Dismissed'],
        default: 'Open',
        index: true,
    },
    resolution: {
        type: String,
        default: '',
    },
    resolutionNotes: {
        type: String,
        default: '',
    },
    resolvedByEmail: {
        type: String,
        default: '',
    },
    resolvedAt: Date,
    deletedAt: {
        type: Date,
        default: null,
        index: true,
    },
}, { timestamps: true });

// Pre-save hook: Sync tenant references
disputeSchema.pre('save', function (next) {
    if (this.claimantOrganizationId && !this.organizationId) this.organizationId = this.claimantOrganizationId;
    if (this.organizationId && !this.claimantOrganizationId) this.claimantOrganizationId = this.organizationId;
    if (this.orgId && !this.organizationId) this.organizationId = this.orgId;
    if (this.organizationId && !this.orgId) this.orgId = this.organizationId;
    next();
});

// Compound indexes for tenant isolation
disputeSchema.index({ claimantOrganizationId: 1, status: 1 });
disputeSchema.index({ respondentOrganizationId: 1, status: 1 });
disputeSchema.index({ organizationId: 1, createdAt: -1 });

const Dispute = mongoose.model('Dispute', disputeSchema);

export default Dispute;
