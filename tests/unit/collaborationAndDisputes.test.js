import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Import from '../../models/Import.js';
import Dispute from '../../models/Dispute.js';

describe('Collaboration & Exception Management Unit Tests', () => {
    const buyerOrgId = new mongoose.Types.ObjectId();
    const supplierOrgId = new mongoose.Types.ObjectId();
    const productId = new mongoose.Types.ObjectId();
    const docId1 = new mongoose.Types.ObjectId();
    const docId2 = new mongoose.Types.ObjectId();

    it('Import messages: records threaded collaboration messages with sender role and optional document attachment', () => {
        const order = new Import({
            poNumber: 'PO-2026-COLLAB-01',
            buyerOrganizationId: buyerOrgId,
            supplierOrganizationId: supplierOrgId,
            userId: 'buyer-user-1',
            userEmail: 'buyer@importer.com',
            productId,
            quantity: 50,
            messages: [{
                senderUserId: 'buyer-user-1',
                senderEmail: 'buyer@importer.com',
                senderRole: 'Buyer',
                message: 'Please confirm ETA at discharge port and share the draft Bill of Lading.',
                documentId: null,
            }, {
                senderUserId: 'supplier-user-2',
                senderEmail: 'supplier@exporter.com',
                senderRole: 'Supplier',
                message: 'Vessel departs this Friday. Attached please find the draft B/L for review.',
                documentId: docId1,
            }],
        });

        const validationErr = order.validateSync();
        assert.equal(validationErr, undefined);
        assert.equal(order.messages.length, 2);
        assert.equal(order.messages[0].senderRole, 'Buyer');
        assert.equal(order.messages[1].senderRole, 'Supplier');
        assert.equal(order.messages[1].documentId.equals(docId1), true);
    });

    it('Dispute Schema: supports structured evidence documents and respondent counter-evidence', () => {
        const dispute = new Dispute({
            disputeNumber: 'DSP-2026-EVIDENCE-01',
            importId: new mongoose.Types.ObjectId(),
            poNumber: 'PO-2026-COLLAB-01',
            claimantOrganizationId: buyerOrgId,
            respondentOrganizationId: supplierOrgId,
            claimantEmail: 'buyer@importer.com',
            respondentEmail: 'supplier@exporter.com',
            reason: 'Cargo Damage in Ocean Transit',
            evidenceNotes: 'Severe moisture damage discovered upon container seal break.',
            evidenceDocumentIds: [docId1],
            status: 'Open',
        });

        const validationErr = dispute.validateSync();
        assert.equal(validationErr, undefined);
        assert.equal(dispute.evidenceDocumentIds.length, 1);
        assert.equal(dispute.evidenceDocumentIds[0].equals(docId1), true);
        assert.equal(dispute.status, 'Open');

        // Respondent counter-evidence
        dispute.counterEvidenceNotes = 'Port of loading SGS survey certificate proved cargo was packaged within 12% moisture threshold.';
        dispute.counterEvidenceDocumentIds = [docId2];
        dispute.status = 'UnderReview';

        const validationErr2 = dispute.validateSync();
        assert.equal(validationErr2, undefined);
        assert.equal(dispute.status, 'UnderReview');
        assert.equal(dispute.counterEvidenceDocumentIds.length, 1);
        assert.equal(dispute.counterEvidenceDocumentIds[0].equals(docId2), true);
    });
});
