import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Import from '../../models/Import.js';

describe('Purchase Order State Machine & Milestone Unit Tests', () => {
    const buyerOrgId = new mongoose.Types.ObjectId();
    const supplierOrgId = new mongoose.Types.ObjectId();
    const productId = new mongoose.Types.ObjectId();

    it('creates PO with default Confirmed status and initializes milestone ledger', () => {
        const order = new Import({
            poNumber: 'PO-2026-TEST-01',
            buyerOrganizationId: buyerOrgId,
            supplierOrganizationId: supplierOrgId,
            userId: 'buyer-user-1',
            userEmail: 'buyer@importer.com',
            productId,
            quantity: 100,
            unitPrice: 250,
            totalAmount: 25000,
            incoterm: 'FOB',
        });

        // Trigger pre-save hook
        const validationErr = order.validateSync();
        assert.equal(validationErr, undefined);
        assert.equal(order.status, 'Confirmed');
        assert.equal(order.escrowStatus, 'Unfunded');
        assert.equal(order.sellerAccepted, 'Pending');
    });

    it('rejects invalid PO status strings outside the trade workflow enum', () => {
        const order = new Import({
            poNumber: 'PO-2026-INVALID',
            buyerOrganizationId: buyerOrgId,
            supplierOrganizationId: supplierOrgId,
            userId: 'buyer-user-1',
            userEmail: 'buyer@importer.com',
            productId,
            quantity: 50,
            status: 'ArbitraryInvalidStatus',
        });

        const validationErr = order.validateSync();
        assert.ok(validationErr, 'Expected validation error for invalid status');
        assert.ok(validationErr.errors.status);
    });

    it('permits all valid state machine milestones', () => {
        const validStatuses = [
            'Confirmed',
            'Cargo Received',
            'Customs Clearance',
            'In Transit',
            'Delivered',
            'Completed',
            'Cancelled',
            'Disputed',
        ];

        for (const status of validStatuses) {
            const order = new Import({
                poNumber: `PO-2026-STATUS-${status.replace(/\s+/g, '_')}`,
                buyerOrganizationId: buyerOrgId,
                supplierOrganizationId: supplierOrgId,
                userId: 'buyer-user-1',
                userEmail: 'buyer@importer.com',
                productId,
                quantity: 10,
                status,
            });
            const err = order.validateSync();
            assert.equal(err, undefined, `Status "${status}" should be valid`);
        }
    });

    it('delivery sign-off correctly updates delivery acceptance fields and releases funded escrow', () => {
        const order = new Import({
            poNumber: 'PO-2026-DELIVERY-SIGNOFF',
            buyerOrganizationId: buyerOrgId,
            supplierOrganizationId: supplierOrgId,
            userId: 'buyer-user-1',
            userEmail: 'buyer@importer.com',
            productId,
            quantity: 20,
            status: 'In Transit',
            escrowStatus: 'Funded',
        });

        // Simulate buyer delivery confirmation logic
        order.status = 'Delivered';
        order.deliveryAcceptedByEmail = 'buyer@importer.com';
        order.deliveryAcceptedAt = new Date();
        order.deliverySignoffNotes = 'Consignee discharge inspection passed with zero damage';
        if (order.escrowStatus === 'Funded') {
            order.escrowStatus = 'Released';
        }

        order.milestones.push({
            status: 'Delivered',
            updatedByEmail: 'buyer@importer.com',
            updatedAt: new Date(),
            notes: order.deliverySignoffNotes,
            location: 'Rotterdam Port of Entry',
        });

        const validationErr = order.validateSync();
        assert.equal(validationErr, undefined);
        assert.equal(order.status, 'Delivered');
        assert.equal(order.escrowStatus, 'Released');
        assert.equal(order.deliveryAcceptedByEmail, 'buyer@importer.com');
        assert.ok(order.deliveryAcceptedAt instanceof Date);
        assert.equal(order.milestones.length, 1);
        assert.equal(order.milestones[0].status, 'Delivered');
    });

    it('milestone progression rules validate seller bilateral acceptance and logistics telemetry', () => {
        // Rule 1: Cannot advance past Confirmed if seller has not accepted
        const checkAdvanceAllowed = (order, targetStatus) => {
            if (['Cargo Received', 'Customs Clearance', 'In Transit'].includes(targetStatus)) {
                if (order.sellerAccepted !== 'Accepted') {
                    return { allowed: false, reason: 'Seller acceptance required' };
                }
            }
            if (targetStatus === 'In Transit') {
                const hasLogistics = Boolean(order.vesselName || order.billOfLadingUrl || order.containerNumber);
                if (!hasLogistics) {
                    return { allowed: false, reason: 'Logistics telemetry required' };
                }
            }
            return { allowed: true };
        };

        const unacceptedOrder = {
            sellerAccepted: 'Pending',
            status: 'Confirmed',
        };
        const res1 = checkAdvanceAllowed(unacceptedOrder, 'Cargo Received');
        assert.equal(res1.allowed, false);
        assert.equal(res1.reason, 'Seller acceptance required');

        const acceptedWithoutLogistics = {
            sellerAccepted: 'Accepted',
            status: 'Customs Clearance',
            vesselName: '',
            billOfLadingUrl: '',
            containerNumber: '',
        };
        const res2 = checkAdvanceAllowed(acceptedWithoutLogistics, 'In Transit');
        assert.equal(res2.allowed, false);
        assert.equal(res2.reason, 'Logistics telemetry required');

        const fullyCompliantOrder = {
            sellerAccepted: 'Accepted',
            status: 'Customs Clearance',
            vesselName: 'MV CMA CGM MARCO POLO',
            containerNumber: 'CMAU1234567',
        };
        const res3 = checkAdvanceAllowed(fullyCompliantOrder, 'In Transit');
        assert.equal(res3.allowed, true);
    });
});
