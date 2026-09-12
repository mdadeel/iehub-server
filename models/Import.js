import mongoose from 'mongoose';

const importSchema = new mongoose.Schema({
    // Mandatory Organization Tenancy (Bilateral)
    organizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        default: null,
        index: true,
    },
    buyerOrganizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        default: null,
        index: true,
    },
    supplierOrganizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        default: null,
        index: true,
    },
    // Backwards-compatible aliases
    orgId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        default: null,
        index: true,
        sparse: true,
    },
    sellerOrgId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        default: null,
        index: true,
        sparse: true,
    },
    idempotencyKey: {
        type: String,
        default: null,
        sparse: true,
        index: true,
    },
    userId: {
        type: String,
        required: true,
        index: true,
    },
    createdByUserId: {
        type: String,
        default: '',
        index: true,
    },
    userEmail: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
        index: true,
    },
    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true,
        index: true,
    },
    quantity: {
        type: Number,
        required: true,
        min: 1,
    },
    poNumber: {
        type: String,
        required: true,
        unique: true,
        index: true,
    },
    unitPrice: {
        type: Number,
        default: 0,
        min: 0,
    },
    totalAmount: {
        type: Number,
        default: 0,
        min: 0,
    },
    incoterm: {
        type: String,
        enum: ['FOB', 'CIF', 'EXW', 'CFR', 'DDP', 'FCA', 'CPT', 'CIP', 'DAP', 'DPU', 'FAS'],
        default: 'FOB',
    },
    unit: {
        type: String,
        default: 'Metric Tons (MT)',
    },
    status: {
        type: String,
        enum: ['Confirmed', 'Cargo Received', 'Customs Clearance', 'In Transit', 'Delivered', 'Completed', 'Cancelled', 'Disputed'],
        default: 'Confirmed',
        index: true,
    },
    milestones: [{
        status: { type: String, required: true },
        updatedByEmail: { type: String, required: true },
        updatedAt: { type: Date, default: Date.now },
        notes: { type: String, default: '' },
        location: { type: String, default: '' },
        documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', default: null },
    }],
    deliveryAcceptedByEmail: {
        type: String,
        default: null,
    },
    deliveryAcceptedAt: {
        type: Date,
        default: null,
    },
    deliverySignoffNotes: {
        type: String,
        default: '',
    },
    sellerAccepted: {
        type: String,
        enum: ['Pending', 'Accepted', 'Declined'],
        default: 'Pending',
        index: true,
    },
    escrowStatus: {
        type: String,
        enum: ['Unfunded', 'Funded', 'Released', 'Disputed'],
        default: 'Unfunded',
        index: true,
    },
    vesselName: {
        type: String,
        default: '',
    },
    vesselImo: {
        type: String,
        default: '',
    },
    containerNumber: {
        type: String,
        default: '',
    },
    billOfLadingUrl: {
        type: String,
        default: '',
    },
    destinationPort: {
        type: String,
        default: 'Port of Delivery',
    },
    paymentTerms: {
        type: String,
        default: 'Confirmed Letter of Credit (LC)',
    },
    laycanWindow: {
        type: String,
        default: 'Standard 14-Day Laycan',
    },
    contractNotes: {
        type: String,
        default: '',
    },
    messages: [{
        senderUserId: { type: String, required: true },
        senderEmail: { type: String, required: true },
        senderOrgId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null },
        senderRole: { type: String, enum: ['Buyer', 'Supplier', 'Admin'], required: true },
        message: { type: String, required: true, trim: true },
        documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', default: null },
        createdAt: { type: Date, default: Date.now },
    }],
    deletedAt: {
        type: Date,
        default: null,
        index: true,
    },
}, { timestamps: true });

// Pre-save synchronization hook for tenant references
importSchema.pre('save', function (next) {
    if (!this.createdByUserId && this.userId) this.createdByUserId = this.userId;
    if (this.buyerOrganizationId && !this.organizationId) this.organizationId = this.buyerOrganizationId;
    if (this.organizationId && !this.buyerOrganizationId) this.buyerOrganizationId = this.organizationId;
    if (this.orgId && !this.organizationId) this.organizationId = this.orgId;
    if (this.organizationId && !this.orgId) this.orgId = this.organizationId;
    if (this.sellerOrgId && !this.supplierOrganizationId) this.supplierOrganizationId = this.sellerOrgId;
    if (this.supplierOrganizationId && !this.sellerOrgId) this.sellerOrgId = this.supplierOrganizationId;
    if (!this.milestones || this.milestones.length === 0) {
        this.milestones = [{
            status: this.status || 'Confirmed',
            updatedByEmail: this.userEmail || 'system',
            updatedAt: this.createdAt || new Date(),
            notes: 'Initial binding purchase order issued',
        }];
    }
    next();
});

// Compound indexes for multi-tenant isolation and fast lookup
importSchema.index({ buyerOrganizationId: 1, status: 1 });
importSchema.index({ supplierOrganizationId: 1, status: 1 });
importSchema.index({ organizationId: 1, createdAt: -1 });

const Import = mongoose.model('Import', importSchema);

export default Import;
