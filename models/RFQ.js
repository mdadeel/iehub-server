import mongoose from 'mongoose';

const rfqSchema = new mongoose.Schema({
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
    createdByUserId: {
        type: String,
        default: '',
        index: true,
    },
    rfqNumber: {
        type: String,
        required: true,
        unique: true,
        index: true,
    },
    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true,
        index: true,
    },
    productName: {
        type: String,
        required: true,
        trim: true,
    },
    buyerEmail: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
        index: true,
    },
    buyerName: {
        type: String,
        default: 'Trade Buyer',
    },
    exporterEmail: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
        index: true,
    },
    targetQuantity: {
        type: Number,
        required: true,
        min: 1,
    },
    targetPrice: {
        type: Number,
        required: true,
        min: 0,
    },
    unit: {
        type: String,
        default: 'Metric Tons (MT)',
    },
    incoterm: {
        type: String,
        default: 'FOB',
    },
    destinationPort: {
        type: String,
        default: '',
    },
    paymentTerms: {
        type: String,
        default: 'Confirmed Letter of Credit (LC)',
    },
    notes: {
        type: String,
        default: '',
    },
    status: {
        type: String,
        enum: ['Submitted', 'Countered', 'Accepted', 'Declined', 'ConvertedToPO'],
        default: 'Submitted',
        index: true,
    },
    counterOffers: [{
        byEmail: String,
        counterPrice: Number,
        counterQuantity: Number,
        notes: String,
        createdAt: {
            type: Date,
            default: Date.now,
        }
    }],
    deletedAt: {
        type: Date,
        default: null,
        index: true,
    },
}, { timestamps: true });

// Pre-save hook: Sync tenant references
rfqSchema.pre('save', function (next) {
    if (this.buyerOrganizationId && !this.organizationId) this.organizationId = this.buyerOrganizationId;
    if (this.organizationId && !this.buyerOrganizationId) this.buyerOrganizationId = this.organizationId;
    if (this.orgId && !this.organizationId) this.organizationId = this.orgId;
    if (this.organizationId && !this.orgId) this.orgId = this.organizationId;
    if (this.sellerOrgId && !this.supplierOrganizationId) this.supplierOrganizationId = this.sellerOrgId;
    if (this.supplierOrganizationId && !this.sellerOrgId) this.sellerOrgId = this.supplierOrganizationId;
    next();
});

// Compound indexes for tenant-scoped querying
rfqSchema.index({ buyerOrganizationId: 1, status: 1 });
rfqSchema.index({ supplierOrganizationId: 1, status: 1 });
rfqSchema.index({ organizationId: 1, createdAt: -1 });

const RFQ = mongoose.model('RFQ', rfqSchema);

export default RFQ;
