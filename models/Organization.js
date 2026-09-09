import mongoose from 'mongoose';

const organizationSchema = new mongoose.Schema({
    legalName: {
        type: String,
        required: true,
        trim: true,
    },
    type: {
        type: String,
        enum: ['Buyer', 'Supplier', 'LogisticsPartner', 'InspectionAgency', 'Platform'],
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
        enum: ['Pending', 'Verified', 'Requires Review', 'Suspended'],
        default: 'Pending',
    },
    members: [{
        userId: String,
        email: String,
        role: {
            type: String,
            enum: ['Admin', 'Manager', 'Agent', 'Viewer'],
            default: 'Agent',
        },
        joinedAt: {
            type: Date,
            default: Date.now,
        }
    }]
}, { timestamps: true });

const Organization = mongoose.model('Organization', organizationSchema);

export default Organization;
