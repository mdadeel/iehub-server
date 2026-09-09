import mongoose from 'mongoose';

const rfqSchema = new mongoose.Schema({
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
    },
    productName: {
        type: String,
        required: true,
    },
    buyerEmail: {
        type: String,
        required: true,
        index: true,
    },
    buyerName: {
        type: String,
        default: 'Trade Buyer',
    },
    exporterEmail: {
        type: String,
        required: true,
        index: true,
    },
    targetQuantity: {
        type: Number,
        required: true,
    },
    targetPrice: {
        type: Number,
        required: true,
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
    }]
}, { timestamps: true });

const RFQ = mongoose.model('RFQ', rfqSchema);

export default RFQ;
