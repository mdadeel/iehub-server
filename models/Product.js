import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    image: {
        type: String,
        required: true,
    },
    price: {
        type: Number,
        required: true,
    },
    origin: {
        type: String,
        required: true,
    },
    rating: {
        type: Number,
        default: 0,
    },
    quantity: {
        type: Number,
        required: true,
    },
    category: {
        type: String,
        required: true,
    },
    description: {
        type: String,
        default: '',
    },
    incoterm: {
        type: String,
        enum: ['FOB', 'CIF', 'EXW', 'CFR', 'DDP'],
        default: 'FOB',
    },
    unit: {
        type: String,
        default: 'Metric Tons (MT)',
    },
    moq: {
        type: Number,
        default: 1,
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
        default: '0906.11', // Standard Harmonized Tariff Code
    },
    exporterEmail: {
        type: String,
        default: null // Null means it's a seed product or platform product. Email indicates user export.
    },
    isApproved: {
        type: Boolean,
        default: true
    },
    verificationStatus: {
        type: String,
        enum: ['pending', 'verified', 'rejected'],
        default: 'verified'
    },
    verificationBadge: {
        type: String,
        default: 'Inspected'
    },
    certificates: [{
        name: String,
        issuer: String,
        url: String
    }]
}, { timestamps: true });

const Product = mongoose.model('Product', productSchema);

export default Product;
