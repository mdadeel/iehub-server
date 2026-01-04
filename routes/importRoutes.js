import express from 'express';
import Import from '../models/Import.js';
import Product from '../models/Product.js';

const router = express.Router();

// GET imports by user email
router.get('/:email', async (req, res) => {
    try {
        const imports = await Import.find({ userEmail: req.params.email }).populate('productId');
        res.json(imports);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// POST create import
router.post('/', async (req, res) => {
    const { productId, quantity, userId, userEmail } = req.body;

    try {
        // 1. Find the product
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        // 2. Validate quantity
        if (product.quantity < quantity) {
            return res.status(400).json({ message: 'Insufficient stock available' });
        }

        // 3. Create Import record
        const newImport = new Import({
            userId,
            userEmail,
            productId,
            quantity
        });

        await newImport.save();

        // 4. Update Product quantity ($inc -quantity)
        product.quantity -= quantity;
        await product.save();

        res.status(201).json(newImport);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// DELETE remove import
router.delete('/:id', async (req, res) => {
    try {
        const importItem = await Import.findById(req.params.id);
        if (!importItem) return res.status(404).json({ message: 'Import not found' });

        // Optional: Restore stock? The requirement doesn't explicitly say so, but it's good practice.
        // However, for "Import" it might mean "Consuming".
        // "My Imports" -> "Remove" might just mean "remove from my list".
        // But if I "un-import", logically items should return.
        // Let's NOT restore stock automatically to avoid complex business logic assumptions unless specified.
        // Actually wait, "Add Export" -> "All Products". "Import" -> "My Imports".
        // If I remove from "My Imports", it's deleted.
        // Let's just delete the record.

        await importItem.deleteOne();
        res.json({ message: 'Import removed successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

export default router;
