import express from 'express';
import Product from '../models/Product.js';
import { handleAsyncError } from '../utils/errorHandler.js';

const router = express.Router();

const buildProductQuery = (query) => {
    const { search, category, exporterEmail } = query;
    let filter = {};

    if (search) {
        filter.name = { $regex: search, $options: 'i' };
    }

    if (category && category !== 'All') {
        filter.category = category;
    }

    if (exporterEmail) {
        filter.exporterEmail = exporterEmail;
    }

    return filter;
};

const getProductSortOption = (sortParam) => {
    switch (sortParam) {
        case 'price-low': return { price: 1 };
        case 'price-high': return { price: -1 };
        case 'rating': return { rating: -1 };
        case 'name': return { name: 1 };
        default: return { createdAt: -1 };
    }
};

// GET all products with filtering and searching
router.get('/', handleAsyncError(async (req, res) => {
    const filter = buildProductQuery(req.query);
    const sortOption = getProductSortOption(req.query.sort);

    const products = await Product.find(filter).sort(sortOption);
    res.json(products);
}));

// GET single product
router.get('/:id', handleAsyncError(async (req, res) => {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json(product);
}));

// Helper function to validate product quantity
const validateProductQuantity = (quantity) => {
    if (quantity !== undefined && quantity < 0) {
        return { isValid: false, message: "Quantity cannot be negative" };
    }
    return { isValid: true };
};

// POST create product (Add Export)
router.post('/', handleAsyncError(async (req, res) => {
    const product = new Product(req.body);
    const newProduct = await product.save();
    res.status(201).json(newProduct);
}));

// PATCH update product (Update details or reduce quantity)
router.patch('/:id', handleAsyncError(async (req, res) => {
    const product = await Product.findById(req.params.id);
    if (!product) {
        return res.status(404).json({ message: 'Product not found' });
    }

    // Validate quantity if present in update
    const quantityValidation = validateProductQuantity(req.body.quantity);
    if (!quantityValidation.isValid) {
        return res.status(400).json({ message: quantityValidation.message });
    }

    Object.assign(product, req.body);
    const updatedProduct = await product.save();
    res.json(updatedProduct);
}));

// DELETE product
router.delete('/:id', handleAsyncError(async (req, res) => {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) {
        return res.status(404).json({ message: 'Product not found' });
    }

    res.json({ message: 'Product deleted' });
}));

export default router;
