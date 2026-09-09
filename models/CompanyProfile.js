import mongoose from 'mongoose';

const companyProfileSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        unique: true,
        index: true,
    },
    userEmail: {
        type: String,
        required: true,
        index: true,
    },
    companyLegalName: {
        type: String,
        default: '',
    },
    taxId: {
        type: String, // EIN / VAT / GST / TIN
        default: '',
    },
    eoriNumber: {
        type: String, // Economic Operators Registration and Identification
        default: '',
    },
    customsBroker: {
        type: String,
        default: '',
    },
    portOfPreference: {
        type: String, // Preferred UN/LOCODE discharge port
        default: '',
    },
    settlementCurrency: {
        type: String,
        default: 'USD',
    },
    swiftBic: {
        type: String,
        default: '',
    },
    escrowBeneficiary: {
        type: String,
        default: '',
    },
    kybStatus: {
        type: String,
        enum: ['Pending', 'Verified', 'Requires Review'],
        default: 'Pending',
    }
}, { timestamps: true });

const CompanyProfile = mongoose.model('CompanyProfile', companyProfileSchema);

export default CompanyProfile;
