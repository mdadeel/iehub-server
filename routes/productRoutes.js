import express from 'express';
import Product from '../models/Product.js';
import AuditLog from '../models/AuditLog.js';
import { handleAsyncError, ApiError } from '../utils/errorHandler.js';
import { verifyAuth } from '../middleware/authMiddleware.js';
import { resolveOrg } from '../middleware/resolveOrg.js';
import { requirePermission, requirePlatformRole } from '../middleware/requirePermission.js';

const router = express.Router();

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildProductQuery = (query) => {
    const { search, category, exporterEmail, incoterm, organizationId } = query;
    let filter = { deletedAt: null };

    if (search) {
        const escaped = escapeRegex(search);
        filter.$or = [
            { name: { $regex: escaped, $options: 'i' } },
            { origin: { $regex: escaped, $options: 'i' } },
            { description: { $regex: escaped, $options: 'i' } },
        ];
    }

    if (category && category !== 'All') {
        filter.category = category;
    }

    if (incoterm && incoterm !== 'All') {
        filter.incoterm = incoterm;
    }

    if (exporterEmail) {
        filter.exporterEmail = exporterEmail;
    }

    if (organizationId) {
        filter.organizationId = organizationId;
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

// GET all products with filtering and searching (Public)
router.get('/', handleAsyncError(async (req, res) => {
    const filter = buildProductQuery(req.query);
    const sortOption = getProductSortOption(req.query.sort);

    const products = await Product.find(filter).sort(sortOption);
    res.json(products);
}));

// GET single product (Public)
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

// POST create product (Add Export) — Authenticated + org role gate
router.post('/', verifyAuth, resolveOrg, requirePermission('product:create'), handleAsyncError(async (req, res) => {
    const allowed = ['name', 'image', 'price', 'origin', 'rating', 'quantity', 'category', 'description', 'incoterm', 'unit', 'moq', 'portOfOrigin', 'currency', 'hsCode'];
    const data = {};
    for (const k of allowed) if (req.body[k] !== undefined) data[k] = req.body[k];

    // Enforce exporterEmail strictly from authenticated token
    data.exporterEmail = req.user.email;
    data.organizationId = req.orgId || null;
    data.orgId = req.orgId || null;
    data.createdByUserId = req.user.uid;

    if (!data.name || !data.image || data.price == null || !data.origin || data.quantity == null || !data.category) {
        throw new ApiError('Missing required fields: name, image, price, origin, quantity, category', 400);
    }
    if (typeof data.price !== 'number' || data.price < 0) throw new ApiError('Price must be a non-negative number', 400);
    if (typeof data.quantity !== 'number' || data.quantity < 0) throw new ApiError('Quantity must be a non-negative number', 400);

    const product = new Product(data);
    const newProduct = await product.save();
    res.status(201).json(newProduct);
}));

// PATCH update product — Authenticated (Owner or Admin)
router.patch('/:id', verifyAuth, resolveOrg, requirePermission('product:update(own)'), handleAsyncError(async (req, res) => {
    const product = await Product.findById(req.params.id);
    if (!product || product.deletedAt) {
        return res.status(404).json({ message: 'Product not found' });
    }

    // Ownership check (Multi-tenant IDOR mitigation)
    const isOwner = (product.organizationId && req.orgId && String(product.organizationId) === String(req.orgId)) ||
                    (product.orgId && req.orgId && String(product.orgId) === String(req.orgId)) ||
                    (product.exporterEmail && product.exporterEmail === req.user.email) ||
                    req.user.isAdmin;
    if (!isOwner) {
        throw new ApiError('Not authorized to modify this listing for this organization', 403);
    }

    const quantityValidation = validateProductQuantity(req.body.quantity);
    if (!quantityValidation.isValid) {
        return res.status(400).json({ message: quantityValidation.message });
    }
    if (req.body.price !== undefined && (typeof req.body.price !== 'number' || req.body.price < 0)) {
        return res.status(400).json({ message: 'Price must be a non-negative number' });
    }

    // Prevent mass-assignment of protected fields
    const allowedPatch = ['name', 'image', 'price', 'origin', 'rating', 'quantity', 'category', 'description', 'incoterm', 'unit', 'moq', 'portOfOrigin', 'currency', 'hsCode'];
    const patch = {};
    for (const k of allowedPatch) if (req.body[k] !== undefined) patch[k] = req.body[k];
    Object.assign(product, patch);
    const updatedProduct = await product.save();
    res.json(updatedProduct);
}));

// PATCH verify product — Platform Operations Admin only + Audit Logged
router.patch('/:id/verify', verifyAuth, requirePlatformRole('Operations Admin'), handleAsyncError(async (req, res) => {
    const { status, badge } = req.body;
    if (!['pending','verified','rejected'].includes(status)) throw new ApiError('Invalid status', 400);

    const product = await Product.findByIdAndUpdate(
        req.params.id,
        { verificationStatus: status, verificationBadge: badge, isApproved: status === 'verified' },
        { new: true }
    );
    if (!product) return res.status(404).json({ message: 'Product not found' });

    // Record audit event
    await AuditLog.create({
        orgId: product.organizationId || product.orgId || null,
        actorEmail: req.user.email,
        action: `LISTING_${status.toUpperCase()}`,
        targetEntity: 'Product',
        targetId: String(product._id),
        details: { badge, status, productName: product.name },
        ipAddress: req.ip || '',
    }).catch(err => console.error('Audit log failed:', err));

    res.json(product);
}));

// DELETE product — Authenticated (Owner or Admin)
router.delete('/:id', verifyAuth, resolveOrg, requirePermission('product:delete(own)'), handleAsyncError(async (req, res) => {
    const product = await Product.findById(req.params.id);
    if (!product || product.deletedAt) {
        return res.status(404).json({ message: 'Product not found' });
    }

    // Ownership check (Multi-tenant IDOR mitigation)
    const isOwner = (product.organizationId && req.orgId && String(product.organizationId) === String(req.orgId)) ||
                    (product.orgId && req.orgId && String(product.orgId) === String(req.orgId)) ||
                    (product.exporterEmail && product.exporterEmail === req.user.email) ||
                    req.user.isAdmin;
    if (!isOwner) {
        throw new ApiError('Not authorized to delete this listing for this organization', 403);
    }

    product.deletedAt = new Date();
    await product.save();
    res.json({ message: 'Product deleted' });
}));

export default router;