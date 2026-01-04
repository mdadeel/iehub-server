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
    // We store a snapshot of product details in case the original product is deleted or changed,
    // OR we populate. Requirement says "Clicking Remove will remove data both from UI and database".
    // It also says "Clicking See Details will take user to Product Details page".
    // This implies the product must still exist or we handle it gracefully.
    // For simplicity, we'll reference the Product.

    quantity: {
        type: Number,
        required: true,
    }
}, { timestamps: true });

const Import = mongoose.model('Import', importSchema);

export default Import;
