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
    }
}, { timestamps: true });

const Import = mongoose.model('Import', importSchema);

export default Import;
