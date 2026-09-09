import mongoose from 'mongoose';

const disputeSchema = new mongoose.Schema({
    orgId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        default: null,
        index: true,
        sparse: true,
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
    },
    poNumber: {
        type: String,
        required: true,
    },
    claimantEmail: {
        type: String,
        required: true,
        index: true,
    },
    respondentEmail: {
        type: String,
        required: true,
        index: true,
    },
    reason: {
        type: String,
        required: true,
    },
    claimAmount: {
        type: Number,
        default: 0,
    },
    evidenceNotes: {
        type: String,
        required: true,
    },
    status: {
        type: String,
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
}, { timestamps: true });

const Dispute = mongoose.model('Dispute', disputeSchema);

export default Dispute;
