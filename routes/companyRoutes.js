import express from 'express';
import CompanyProfile from '../models/CompanyProfile.js';
import { handleAsyncError, ApiError } from '../utils/errorHandler.js';
import { verifyAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

// GET company profile by user email — Authenticated (Self or Admin)
router.get('/:email', verifyAuth, handleAsyncError(async (req, res) => {
    // IDOR check: caller must be the profile owner or admin
    if (req.user.email !== req.params.email.toLowerCase() && !req.user.isAdmin) {
        throw new ApiError('Not authorized to view this corporate profile', 403);
    }

    const profile = await CompanyProfile.findOne({ userEmail: req.params.email });
    if (!profile) {
        // Return default profile skeleton — unverified until KYB actually happens
        return res.json({
            userEmail: req.params.email,
            companyLegalName: '',
            taxId: '',
            eoriNumber: '',
            customsBroker: '',
            portOfPreference: '',
            settlementCurrency: 'USD',
            swiftBic: '',
            escrowBeneficiary: '',
            kybStatus: 'Pending'
        });
    }
    res.json(profile);
}));

// POST upsert company profile — Authenticated
router.post('/', verifyAuth, handleAsyncError(async (req, res) => {
    // Identity strictly bound from authenticated session
    const userEmail = req.user.email;
    const userId = req.user.uid;

    const allowed = [
        'companyLegalName', 'taxId', 'eoriNumber', 'customsBroker',
        'portOfPreference', 'settlementCurrency', 'swiftBic', 'escrowBeneficiary'
    ];
    const updateData = { userId, userEmail };
    for (const key of allowed) {
        if (req.body[key] !== undefined) updateData[key] = req.body[key];
    }

    // Only admin can promote KYB status to Verified
    if (req.user.isAdmin && req.body.kybStatus) {
        updateData.kybStatus = req.body.kybStatus;
    }

    const updated = await CompanyProfile.findOneAndUpdate(
        { userEmail },
        updateData,
        { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.json(updated);
}));

export default router;
