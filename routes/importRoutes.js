import express from 'express';
import Import from '../models/Import.js';
import Product from '../models/Product.js';
import { handleAsyncError } from '../utils/errorHandler.js';

const router = express.Router();

// GET imports by user email
router.get('/:email', handleAsyncError(async (req, res) => {
    const imports = await Import.find({ userEmail: req.params.email }).populate('productId');
    res.json(imports);
}));

const validateImportRequest = async (productId, quantity) => {
    const product = await Product.findById(productId);
    if (!product) {
        return { isValid: false, error: 'Product not found', product: null };
    }

    if (product.quantity < quantity) {
        return { isValid: false, error: 'Insufficient stock available', product };
    }

    return { isValid: true, product };
};

const createImportAndUpdateProduct = async (importData, product) => {
    const newImport = new Import(importData);
    await newImport.save();

    product.quantity -= importData.quantity;
    await product.save();

    return newImport;
};

// POST create import
router.post('/', handleAsyncError(async (req, res) => {
    const { productId, quantity, userId, userEmail } = req.body;

    // Validate the import request
    const validation = await validateImportRequest(productId, quantity);
    if (!validation.isValid) {
        return res.status(400).json({ message: validation.error });
    }

    // Create import and update product
    const newImport = await createImportAndUpdateProduct({
        userId,
        userEmail,
        productId,
        quantity
    }, validation.product);

    res.status(201).json(newImport);
}));

// DELETE remove import
router.delete('/:id', handleAsyncError(async (req, res) => {
    const importItem = await Import.findByIdAndDelete(req.params.id);
    if (!importItem) {
        return res.status(404).json({ message: 'Import not found' });
    }

    res.json({ message: 'Import removed successfully' });
}));

export default router;
