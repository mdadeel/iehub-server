import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
    },
    image: {
        type: String,
        required: true,
    },
    price: {
        type: Number,
        required: true,
        min: 0,
    },
    origin: {
        type: String,
        required: true,
        trim: true,
    },
    rating: {
        type: Number,
        default: 0,
        min: 0,
        max: 5,
    },
    quantity: {
        type: Number,
        required: true,
        min: 0,
    },
    category: {
        type: String,
        required: true,
        index: true,
    },
    description: {
        type: String,
        default: '',
    },
    incoterm: {
        type: String,
        enum: ['FOB', 'CIF', 'EXW', 'CFR', 'DDP'],
        default: 'FOB',
        index: true,
    },
    unit: {
        type: String,
        default: 'Metric Tons (MT)',
    },
    moq: {
        type: Number,
        default: 1,
        min: 1,
    },
    portOfOrigin: {
        type: String,
        default: '',
    },
    currency: {
        type: String,
        default: 'USD',
    },
    hsCode: {
        type: String,
        default: '0906.11',
    },
    // Mandatory Tenant Fields
    organizationId: {
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
    exporterEmail: {
        type: String,
        default: null,
        lowercase: true,
        trim: true,
        index: true,
    },
    isApproved: {
        type: Boolean,
        default: true,
    },
    verificationStatus: {
        type: String,
        enum: ['pending', 'verified', 'rejected'],
        default: 'verified',
        index: true,
    },
    verificationBadge: {
        type: String,
        default: 'Inspected',
    },
    certificates: [{
        name: String,
        issuer: String,
        url: String,
    }],
    deletedAt: {
        type: Date,
        default: null,
        index: true,
    },
}, { timestamps: true });

// Pre-save hook: Sync organizationId and orgId
productSchema.pre('save', function (next) {
    if (this.organizationId && !this.orgId) this.orgId = this.organizationId;
    if (this.orgId && !this.organizationId) this.organizationId = this.orgId;
    next();
});

// Compound indexes for tenant-scoped querying and filtering
productSchema.index({ organizationId: 1, createdAt: -1 });
productSchema.index({ organizationId: 1, category: 1 });
productSchema.index({ organizationId: 1, verificationStatus: 1 });

const Product = mongoose.model('Product', productSchema);

export default Product;
