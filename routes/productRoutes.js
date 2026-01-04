import express from 'express';
import Product from '../models/Product.js';

const router = express.Router();

// GET all products with filtering and searching
router.get('/', async (req, res) => {
    try {
        const { search, category, sort, exporterEmail } = req.query;
        let query = {};

        if (search) {
            query.name = { $regex: search, $options: 'i' };
        }

        if (category && category !== 'All') {
            query.category = category;
        }

        if (exporterEmail) {
            query.exporterEmail = exporterEmail;
        }

        let sortOption = {};
        if (sort === 'price-low') sortOption = { price: 1 };
        else if (sort === 'price-high') sortOption = { price: -1 };
        else if (sort === 'rating') sortOption = { rating: -1 };
        else if (sort === 'name') sortOption = { name: 1 };
        else sortOption = { createdAt: -1 }; // Default: Newest first

        const products = await Product.find(query).sort(sortOption);
        res.json(products);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// GET single product
router.get('/:id', async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ message: 'Product not found' });
        res.json(product);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// POST create product (Add Export)
router.post('/', async (req, res) => {
    const product = new Product(req.body);
    try {
        const newProduct = await product.save();
        res.status(201).json(newProduct);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// PATCH update product (Update details or reduce quantity)
router.patch('/:id', async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ message: 'Product not found' });

        // Handle quantity reduction for imports specially if needed, 
        // but for now generic update works for both Use Cases (Edit & Import)
        // If logic gets complex, we can separate endpoints.

        // Example specific logic: check if reducing quantity is valid
        if (req.body.quantity !== undefined && req.body.quantity < 0) {
            return res.status(400).json({ message: "Quantity cannot be negative" });
        }

        Object.assign(product, req.body);
        const updatedProduct = await product.save();
        res.json(updatedProduct);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// DELETE product
router.delete('/:id', async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ message: 'Product not found' });

        await product.deleteOne();
        res.json({ message: 'Product deleted' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

export default router;
