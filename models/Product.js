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
    exporterEmail: {
        type: String,
        default: null // Null means it's a seed product or platform product. Email indicates user export.
    },
    isApproved: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

const Product = mongoose.model('Product', productSchema);

export default Product;
