import mongoose from 'mongoose';

const importSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
    },
    userEmail: {
        type: String, // Useful for display
        required: true,
    },
    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true,
    },
    quantity: {
        type: Number,
        required: true,
    },
    poNumber: {
        type: String,
        required: true,
    },
    unitPrice: {
        type: Number,
        default: 0,
    },
    totalAmount: {
        type: Number,
        default: 0,
    },
    incoterm: {
        type: String,
        default: 'FOB',
    },
    unit: {
        type: String,
        default: 'Metric Tons (MT)',
    },
    status: {
        type: String,
        enum: ['Confirmed', 'Customs Clearance', 'In Transit', 'Delivered', 'Cancelled', 'Disputed'],
        default: 'Confirmed',
    },
    sellerAccepted: {
        type: String,
        enum: ['Pending', 'Accepted', 'Declined'],
        default: 'Pending',
    },
    escrowStatus: {
        type: String,
        enum: ['Unfunded', 'Funded', 'Released', 'Disputed'],
        default: 'Unfunded',
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
    }
}, { timestamps: true });

const Import = mongoose.model('Import', importSchema);

export default Import;
