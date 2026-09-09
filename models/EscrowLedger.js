import mongoose from 'mongoose';

const escrowLedgerSchema = new mongoose.Schema({
    importId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Import',
        required: true,
        unique: true,
        index: true,
    },
    poNumber: {
        type: String,
        required: true,
    },
    buyerEmail: {
        type: String,
        required: true,
        index: true,
    },
    exporterEmail: {
        type: String,
        required: true,
        index: true,
    },
    totalAmount: {
        type: Number,
        required: true,
    },
    currency: {
        type: String,
        default: 'USD',
    },
    status: {
        type: String,
        enum: ['PendingDeposit', 'Funded', 'PartialRelease', 'FullyReleased', 'Disputed', 'Refunded'],
        default: 'PendingDeposit',
        index: true,
    },
    depositReference: {
        type: String,
        default: '',
    },
    depositDate: Date,
    releasedAmount: {
        type: Number,
        default: 0,
    },
    releases: [{
        milestone: String,
        amount: Number,
        authorizedBy: String,
        releasedAt: {
            type: Date,
            default: Date.now,
        }
    }]
}, { timestamps: true });

const EscrowLedger = mongoose.model('EscrowLedger', escrowLedgerSchema);

export default EscrowLedger;
