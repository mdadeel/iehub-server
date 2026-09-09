import mongoose from 'mongoose';

const createSlug = (legalName, short) => `${legalName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32)}-${short}`;

const organizationSchema = new mongoose.Schema({
    legalName: {
        type: String,
        required: true,
        trim: true,
    },
    slug: {
        type: String,
        unique: true,
        sparse: true,
        index: true,
        lowercase: true,
        trim: true,
    },
    type: {
        type: String,
        enum: ['Buyer', 'Supplier', 'Both', 'LogisticsPartner', 'InspectionAgency', 'Platform'],
        default: 'Buyer',
    },
    taxId: {
        type: String,
        default: '',
    },
    eoriNumber: {
        type: String,
        default: '',
    },
    country: {
        type: String,
        default: 'Global',
    },
    kybStatus: {
        type: String,
        enum: ['Pending', 'Verified', 'Requires Review', 'Suspended', 'Rejected'],
        default: 'Pending',
    },
    plan: {
        type: String,
        enum: ['Free', 'Standard', 'Enterprise'],
        default: 'Free',
    },
    ownerUserId: {
        type: String,
        default: '',
        index: true,
    },
    billingEmail: {
        type: String,
        default: '',
        lowercase: true,
        trim: true,
    },
    settings: {
        settlementCurrency: { type: String, default: 'USD' },
        portOfPreference: { type: String, default: '' },
        swiftBic: { type: String, default: '' },
    },
    members: [{
        userId: String,
        email: String,
        role: {
            type: String,
            enum: ['Admin', 'Manager', 'Agent', 'Viewer', 'Owner'],
            default: 'Agent',
        },
        joinedAt: {
            type: Date,
            default: Date.now,
        }
    }]
}, { timestamps: true });

organizationSchema.pre('validate', function (next) {
    if (!this.slug && this.legalName) {
        const short = (this._id ? String(this._id).slice(-4) : Math.random().toString(36).slice(2, 6));
        this.slug = createSlug(this.legalName, short);
    }
    next();
});

const Organization = mongoose.model('Organization', organizationSchema);

export default Organization;
