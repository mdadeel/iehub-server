import express from 'express';
import Import from '../models/Import.js';
import Document from '../models/Document.js';
import Dispute from '../models/Dispute.js';
import { handleAsyncError, ApiError } from '../utils/errorHandler.js';
import { verifyAuth } from '../middleware/authMiddleware.js';
import { resolveOrg } from '../middleware/resolveOrg.js';

const router = express.Router();

/**
 * Helper to escape CSV field per RFC 4180
 */
const escapeCsv = (val) => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
};

// GET /api/analytics/export — Export trade data in CSV or JSON for ERP integration
router.get('/export', verifyAuth, resolveOrg, handleAsyncError(async (req, res) => {
    const type = (req.query.type || 'orders').toLowerCase();
    const format = (req.query.format || 'json').toLowerCase();

    if (!['orders', 'documents', 'disputes'].includes(type)) {
        throw new ApiError('Invalid export type. Supported: orders, documents, disputes', 400);
    }

    if (!['csv', 'json'].includes(format)) {
        throw new ApiError('Invalid export format. Supported: csv, json', 400);
    }

    const isSuperAdmin = req.user?.isAdmin;
    const orgId = req.orgId;

    if (type === 'orders') {
        let query = { deletedAt: null };
        if (!isSuperAdmin) {
            if (orgId) {
                query.$or = [{ buyerOrganizationId: orgId }, { supplierOrganizationId: orgId }];
            } else {
                query.$or = [{ userEmail: req.user.email }];
            }
        }

        const orders = await Import.find(query).populate('productId').sort({ createdAt: -1 });

        if (format === 'json') {
            return res.json(orders);
        }

        // CSV Format
        const headers = [
            'PO Number',
            'Order ID',
            'Date Placed',
            'Product Name',
            'Origin Country',
            'Quantity',
            'Unit',
            'Unit Price FOB ($)',
            'Total Sum ($)',
            'Incoterm',
            'Status',
            'Payment Terms',
            'Destination Port',
            'Vessel Name',
            'Container BIC',
            'Bill of Lading URL',
            'Escrow Status',
            'Delivery Confirmed At',
        ];

        const rows = orders.map(o => [
            escapeCsv(o.poNumber || o._id),
            escapeCsv(o._id),
            escapeCsv(o.createdAt ? new Date(o.createdAt).toISOString() : ''),
            escapeCsv(o.productId?.name || o.title || 'Commodity'),
            escapeCsv(o.productId?.origin || 'Global'),
            escapeCsv(o.quantity),
            escapeCsv(o.unit || 'MT'),
            escapeCsv(o.price),
            escapeCsv(o.totalPrice || (o.quantity * o.price)),
            escapeCsv(o.incoterm || 'FOB'),
            escapeCsv(o.status),
            escapeCsv(o.paymentTerms || 'Commercial Escrow'),
            escapeCsv(o.destinationPort || ''),
            escapeCsv(o.vesselName || ''),
            escapeCsv(o.containerNumber || ''),
            escapeCsv(o.billOfLadingUrl || ''),
            escapeCsv(o.escrowStatus || 'Unfunded'),
            escapeCsv(o.deliveryAcceptedAt ? new Date(o.deliveryAcceptedAt).toISOString() : ''),
        ]);

        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
        const filename = `iehub-orders-export-${new Date().toISOString().split('T')[0]}.csv`;

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(csvContent);
    }

    if (type === 'documents') {
        let query = { deletedAt: null };
        if (!isSuperAdmin) {
            if (!orgId) return res.json([]);
            query.organizationId = orgId;
        }

        const docs = await Document.find(query).sort({ createdAt: -1 });

        if (format === 'json') {
            return res.json(docs);
        }

        const headers = [
            'Document ID',
            'File Name',
            'Document Type',
            'MIME Type',
            'File Size (KB)',
            'Verification Status',
            'Uploaded By',
            'Verified At',
            'Created At',
        ];

        const rows = docs.map(d => [
            escapeCsv(d._id),
            escapeCsv(d.fileName),
            escapeCsv(d.documentType),
            escapeCsv(d.mimeType),
            escapeCsv(Math.round((d.fileSize || 0) / 1024)),
            escapeCsv(d.verificationStatus),
            escapeCsv(d.uploadedByUserEmail),
            escapeCsv(d.verifiedAt ? new Date(d.verifiedAt).toISOString() : ''),
            escapeCsv(d.createdAt ? new Date(d.createdAt).toISOString() : ''),
        ]);

        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
        const filename = `iehub-documents-export-${new Date().toISOString().split('T')[0]}.csv`;

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(csvContent);
    }

    if (type === 'disputes') {
        let query = { deletedAt: null };
        if (!isSuperAdmin) {
            if (orgId) {
                query.$or = [{ claimantOrganizationId: orgId }, { respondentOrganizationId: orgId }];
            } else {
                query.$or = [{ claimantEmail: req.user.email }, { respondentEmail: req.user.email }];
            }
        }

        const disputes = await Dispute.find(query).sort({ createdAt: -1 });

        if (format === 'json') {
            return res.json(disputes);
        }

        const headers = [
            'Dispute Number',
            'Order ID',
            'Claimant Email',
            'Reason',
            'Disputed Amount ($)',
            'Status',
            'Resolution Ruling',
            'Filed Date',
            'Resolved Date',
        ];

        const rows = disputes.map(d => [
            escapeCsv(d.disputeNumber || d._id),
            escapeCsv(d.importId),
            escapeCsv(d.claimantEmail),
            escapeCsv(d.reason),
            escapeCsv(d.disputedAmount || 0),
            escapeCsv(d.status),
            escapeCsv(d.resolution || 'Pending'),
            escapeCsv(d.createdAt ? new Date(d.createdAt).toISOString() : ''),
            escapeCsv(d.resolvedAt ? new Date(d.resolvedAt).toISOString() : ''),
        ]);

        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
        const filename = `iehub-disputes-export-${new Date().toISOString().split('T')[0]}.csv`;

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(csvContent);
    }
}));

export default router;
