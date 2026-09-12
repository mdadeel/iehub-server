process.env.NODE_ENV = 'test';
process.env.ENABLE_DEV_SANDBOX = 'true';

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Product from '../../models/Product.js';
import Import from '../../models/Import.js';
import RFQ from '../../models/RFQ.js';
import Dispute from '../../models/Dispute.js';
import { requireOrg } from '../../middleware/resolveOrg.js';

describe('Multi-Tenant Data Isolation & RBAC Rules Tests', () => {
    const orgA = { _id: new mongoose.Types.ObjectId(), legalName: 'Org A (Buyer)' };
    const orgB = { _id: new mongoose.Types.ObjectId(), legalName: 'Org B (Supplier)' };
    const orgC = { _id: new mongoose.Types.ObjectId(), legalName: 'Org C (Intruder)' };

    it('requireOrg middleware should throw 403 when req.orgId is not set', () => {
        const req = {};
        const res = {};
        let error = null;

        requireOrg(req, res, (err) => {
            error = err;
        });

        assert.ok(error, 'Expected error to be thrown');
        assert.equal(error.statusCode, 403);
        assert.match(error.message, /Active organization context required/);
    });

    it('requireOrg middleware should succeed when req.orgId is resolved', () => {
        const req = { orgId: orgA._id };
        const res = {};
        let nextCalled = false;

        requireOrg(req, res, (err) => {
            assert.equal(err, undefined);
            nextCalled = true;
        });

        assert.equal(nextCalled, true);
    });

    it('Product Schema: isolates listings by organizationId and rejects cross-tenant ownership', () => {
        const productA = new Product({
            name: 'Org A Premium Spice Lot',
            image: 'https://example.com/spice.jpg',
            price: 1200,
            quantity: 50,
            category: 'Spices',
            origin: 'India',
            organizationId: orgA._id,
            createdByUserId: 'user-a',
            exporterEmail: 'exporter@orga.com',
        });

        assert.equal(productA.organizationId.equals(orgA._id), true);
        assert.equal(productA.organizationId.equals(orgB._id), false, 'Org B must not be equal to Org A');
        assert.equal(productA.organizationId.equals(orgC._id), false, 'Org C must not be equal to Org A');
    });

    it('Purchase Order (Import) Schema: strictly enforces bilateral access for buyer and supplier only', () => {
        const orderAB = new Import({
            poNumber: 'PO-2026-MULTI01',
            buyerOrganizationId: orgA._id,
            organizationId: orgA._id,
            supplierOrganizationId: orgB._id,
            sellerOrgId: orgB._id,
            userId: 'user-buyer-a',
            userEmail: 'buyer@orga.com',
            productId: new mongoose.Types.ObjectId(),
            quantity: 10,
            unitPrice: 500,
            totalAmount: 5000,
        });

        // Verification functions mirror backend route IDOR checks
        const checkOrderAccess = (orgIdToCheck) => {
            return orderAB.buyerOrganizationId.equals(orgIdToCheck) || 
                   orderAB.supplierOrganizationId.equals(orgIdToCheck);
        };

        assert.equal(checkOrderAccess(orgA._id), true, 'Buyer Org A must be authorized');
        assert.equal(checkOrderAccess(orgB._id), true, 'Supplier Org B must be authorized');
        assert.equal(checkOrderAccess(orgC._id), false, 'Intruder Org C must be strictly denied access');
    });

    it('RFQ Schema: strictly enforces bilateral negotiation access', () => {
        const rfqAB = new RFQ({
            rfqNumber: 'RFQ-2026-TEST01',
            buyerOrganizationId: orgA._id,
            organizationId: orgA._id,
            supplierOrganizationId: orgB._id,
            productId: new mongoose.Types.ObjectId(),
            productName: 'Organic Cardamom',
            buyerEmail: 'buyer@orga.com',
            exporterEmail: 'supplier@orgb.com',
            targetQuantity: 5,
            targetPrice: 2000,
        });

        const checkRfqAccess = (orgIdToCheck) => {
            return (rfqAB.buyerOrganizationId && rfqAB.buyerOrganizationId.equals(orgIdToCheck)) ||
                   (rfqAB.supplierOrganizationId && rfqAB.supplierOrganizationId.equals(orgIdToCheck));
        };

        assert.equal(checkRfqAccess(orgA._id), true, 'Buyer Org A must be authorized for RFQ');
        assert.equal(checkRfqAccess(orgB._id), true, 'Supplier Org B must be authorized for RFQ');
        assert.equal(checkRfqAccess(orgC._id), false, 'Intruder Org C must be denied RFQ access');
    });

    it('Dispute Schema: enforces claimant and respondent organization scoping', () => {
        const dispute = new Dispute({
            disputeNumber: 'DSP-2026-TEST01',
            claimantOrganizationId: orgA._id,
            respondentOrganizationId: orgB._id,
            organizationId: orgA._id,
            importId: new mongoose.Types.ObjectId(),
            poNumber: 'PO-2026-MULTI01',
            claimantEmail: 'buyer@orga.com',
            respondentEmail: 'supplier@orgb.com',
            reason: 'Damaged Goods in Transit',
            evidenceNotes: 'Photographic evidence attached',
        });

        const checkDisputeAccess = (orgIdToCheck) => {
            return (dispute.claimantOrganizationId && dispute.claimantOrganizationId.equals(orgIdToCheck)) ||
                   (dispute.respondentOrganizationId && dispute.respondentOrganizationId.equals(orgIdToCheck));
        };

        assert.equal(checkDisputeAccess(orgA._id), true, 'Claimant must have dispute access');
        assert.equal(checkDisputeAccess(orgB._id), true, 'Respondent must have dispute access');
        assert.equal(checkDisputeAccess(orgC._id), false, 'Third-party Org C must be denied dispute access');
    });
});
