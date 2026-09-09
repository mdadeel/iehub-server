import express from 'express';
import mongoose from 'mongoose';
import Organization from '../models/Organization.js';
import OrganizationMember from '../models/OrganizationMember.js';
import Invite from '../models/Invite.js';
import { handleAsyncError, ApiError } from '../utils/errorHandler.js';
import { verifyAuth } from '../middleware/authMiddleware.js';
import { resolveOrg } from '../middleware/resolveOrg.js';

const router = express.Router();

// All org routes require auth; some require existing org context only after resolution.

// Helper: ensure slug uniqueness by appending short if collision
async function ensureUniqueSlug(baseSlug) {
    let slug = baseSlug;
    let counter = 0;
    while (await Organization.findOne({ slug })) {
        counter += 1;
        slug = `${baseSlug}-${counter}`;
    }
    return slug;
}

function slugify(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'org';
}

// POST /api/organizations — create personal/team org
router.post('/', verifyAuth, handleAsyncError(async (req, res) => {
    const { legalName, type = 'Both', country = 'Global', taxId = '', eoriNumber = '' } = req.body;
    if (!legalName || !String(legalName).trim()) throw new ApiError('legalName is required', 400);

    const short = new mongoose.Types.ObjectId().toString().slice(-4);
    const baseSlug = `${slugify(legalName)}-${short}`;
    const slug = await ensureUniqueSlug(baseSlug);

    const org = await Organization.create({
        legalName: String(legalName).trim(),
        slug,
        type,
        country,
        taxId,
        eoriNumber,
        ownerUserId: req.user.uid,
        billingEmail: req.user.email,
        settings: {
            settlementCurrency: req.body.settlementCurrency || 'USD',
            portOfPreference: req.body.portOfPreference || '',
            swiftBic: req.body.swiftBic || '',
        },
        members: [{ userId: req.user.uid, email: req.user.email.toLowerCase(), role: 'Owner', joinedAt: new Date() }],
    });

    // Mirror to OrganizationMember explicit collection
    await OrganizationMember.create({
        orgId: org._id,
        userId: req.user.uid,
        email: req.user.email.toLowerCase(),
        orgRole: 'Owner',
        tradeRoles: ['ProcurementManager', 'ExportManager', 'FinanceController', 'InventoryManager'],
        status: 'Active',
        invitedBy: req.user.email,
    });

    res.status(201).json(org);
}));

// GET /api/organizations/mine — list orgs for current user
router.get('/mine', verifyAuth, handleAsyncError(async (req, res) => {
    const memberships = await OrganizationMember.find({ email: req.user.email.toLowerCase(), status: 'Active' }).lean();
    if (!memberships.length) return res.json([]);
    const orgIds = memberships.map(m => m.orgId);
    const orgs = await Organization.find({ _id: { $in: orgIds } }).sort({ createdAt: 1 }).lean();
    // Attach membership role
    const orgMap = new Map(orgs.map(o => [String(o._id), o]));
    const enriched = memberships.map(m => ({
        org: orgMap.get(String(m.orgId)),
        membership: m,
    })).filter(x => x.org);
    // Fallback: if membership references orphan org, still return membership alone
    if (!orgs.length) return res.json(enriched);
    res.json(orgs.map(o => {
        const mem = memberships.find(m => String(m.orgId) === String(o._id));
        return { ...o, myRole: mem?.orgRole, myTradeRoles: mem?.tradeRoles, myMembershipId: mem?._id };
    }));
}));

// GET /api/organizations/invites/mine
router.get('/invites/mine', verifyAuth, handleAsyncError(async (req, res) => {
    const invites = await Invite.find({ email: req.user.email.toLowerCase(), status: 'Pending', expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 });
    res.json(invites);
}));

// POST /api/organizations/invites/:token/accept
router.post('/invites/:token/accept', verifyAuth, handleAsyncError(async (req, res) => {
    const invite = await Invite.findOne({ token: req.params.token });
    if (!invite) throw new ApiError('Invite not found', 404);
    if (invite.status !== 'Pending') throw new ApiError('Invite no longer pending', 400);
    if (invite.expiresAt < new Date()) {
        invite.status = 'Expired';
        await invite.save();
        throw new ApiError('Invite expired', 400);
    }
    if (invite.email.toLowerCase() !== req.user.email.toLowerCase()) throw new ApiError('Invite email does not match authenticated user', 403);

    const existing = await OrganizationMember.findOne({ orgId: invite.orgId, email: req.user.email.toLowerCase() });
    if (existing) {
        existing.status = 'Active';
        existing.orgRole = invite.orgRole;
        existing.tradeRoles = invite.tradeRoles;
        await existing.save();
        invite.status = 'Accepted';
        await invite.save();
        return res.json(existing);
    }
    const member = await OrganizationMember.create({
        orgId: invite.orgId,
        userId: req.user.uid,
        email: req.user.email.toLowerCase(),
        orgRole: invite.orgRole,
        tradeRoles: invite.tradeRoles,
        status: 'Active',
        invitedBy: invite.invitedBy,
    });
    // Also push to embedded members for backward-compat display
    await Organization.findByIdAndUpdate(invite.orgId, { $push: { members: { userId: req.user.uid, email: req.user.email.toLowerCase(), role: invite.orgRole === 'Owner' ? 'Admin' : invite.orgRole, joinedAt: new Date() } } });
    invite.status = 'Accepted';
    await invite.save();
    res.status(201).json(member);
}));

// GET /api/organizations/:id
router.get('/:id', verifyAuth, resolveOrg, handleAsyncError(async (req, res) => {
    const org = await Organization.findById(req.params.id).lean();
    if (!org) throw new ApiError('Organization not found', 404);
    // Only members may view (unless platform admin)
    const isMember = await OrganizationMember.findOne({ orgId: org._id, email: req.user.email.toLowerCase(), status: 'Active' }).lean();
    if (!isMember && !req.user.isAdmin) throw new ApiError('Not a member of this organization', 403);
    res.json(org);
}));

// PATCH /api/organizations/:id
router.patch('/:id', verifyAuth, resolveOrg, handleAsyncError(async (req, res) => {
    const org = await Organization.findById(req.params.id);
    if (!org) throw new ApiError('Organization not found', 404);
    const membership = await OrganizationMember.findOne({ orgId: org._id, email: req.user.email.toLowerCase(), status: 'Active' });
    const isOwnerOrAdmin = membership && ['Owner', 'Admin'].includes(membership.orgRole);
    if (!isOwnerOrAdmin && !req.user.isAdmin) throw new ApiError('Only Owner/Admin may update org', 403);

    const allowed = ['legalName', 'type', 'country', 'taxId', 'eoriNumber', 'plan', 'billingEmail'];
    for (const k of allowed) if (req.body[k] !== undefined) org[k] = req.body[k];
    if (req.body.settlementCurrency !== undefined) org.settings.settlementCurrency = req.body.settlementCurrency;
    if (req.body.portOfPreference !== undefined) org.settings.portOfPreference = req.body.portOfPreference;
    if (req.body.swiftBic !== undefined) org.settings.swiftBic = req.body.swiftBic;
    if (req.body.kybStatus !== undefined && req.user.isAdmin) org.kybStatus = req.body.kybStatus;
    await org.save();
    res.json(org);
}));

// GET /api/organizations/:id/members
router.get('/:id/members', verifyAuth, handleAsyncError(async (req, res) => {
    const org = await Organization.findById(req.params.id);
    if (!org) throw new ApiError('Organization not found', 404);
    const self = await OrganizationMember.findOne({ orgId: org._id, email: req.user.email.toLowerCase(), status: 'Active' });
    if (!self && !req.user.isAdmin) throw new ApiError('Not a member', 403);
    const members = await OrganizationMember.find({ orgId: org._id }).sort({ createdAt: 1 });
    res.json(members);
}));

// PATCH /api/organizations/:id/members/:memberId
router.patch('/:id/members/:memberId', verifyAuth, handleAsyncError(async (req, res) => {
    const org = await Organization.findById(req.params.id);
    if (!org) throw new ApiError('Organization not found', 404);
    const actor = await OrganizationMember.findOne({ orgId: org._id, email: req.user.email.toLowerCase(), status: 'Active' });
    if ((!actor || !['Owner', 'Admin'].includes(actor.orgRole)) && !req.user.isAdmin) throw new ApiError('Only Owner/Admin may change roles', 403);

    const target = await OrganizationMember.findOne({ _id: req.params.memberId, orgId: org._id });
    if (!target) throw new ApiError('Member not found', 404);
    if (req.body.orgRole) {
        // Only Owner may promote to Owner
        if (req.body.orgRole === 'Owner' && actor.orgRole !== 'Owner' && !req.user.isAdmin) throw new ApiError('Only Owner may promote to Owner', 403);
        target.orgRole = req.body.orgRole;
    }
    if (Array.isArray(req.body.tradeRoles)) target.tradeRoles = req.body.tradeRoles;
    if (req.body.status) {
        if (!['Active', 'Suspended'].includes(req.body.status)) throw new ApiError('Invalid status', 400);
        target.status = req.body.status;
    }
    await target.save();
    res.json(target);
}));

// POST /api/organizations/:id/invite
router.post('/:id/invite', verifyAuth, handleAsyncError(async (req, res) => {
    const { email, orgRole = 'Agent', tradeRoles = [] } = req.body;
    if (!email) throw new ApiError('email required', 400);
    const org = await Organization.findById(req.params.id);
    if (!org) throw new ApiError('Organization not found', 404);
    const actor = await OrganizationMember.findOne({ orgId: org._id, email: req.user.email.toLowerCase(), status: 'Active' });
    if ((!actor || !['Owner', 'Admin'].includes(actor.orgRole)) && !req.user.isAdmin) throw new ApiError('Only Owner/Admin may invite', 403);

    const existing = await OrganizationMember.findOne({ orgId: org._id, email: email.toLowerCase() });
    if (existing && existing.status === 'Active') throw new ApiError('User already a member', 400);

    const invite = await Invite.create({
        orgId: org._id,
        email: email.toLowerCase(),
        orgRole,
        tradeRoles,
        invitedBy: req.user.email,
    });
    res.status(201).json(invite);
}));

// DELETE /api/organizations/:id/invites/:inviteId
router.delete('/:id/invites/:inviteId', verifyAuth, handleAsyncError(async (req, res) => {
    const invite = await Invite.findOne({ _id: req.params.inviteId, orgId: req.params.id });
    if (!invite) throw new ApiError('Invite not found', 404);
    const actor = await OrganizationMember.findOne({ orgId: req.params.id, email: req.user.email.toLowerCase(), status: 'Active' });
    if ((!actor || !['Owner', 'Admin'].includes(actor.orgRole)) && !req.user.isAdmin) throw new ApiError('Only Owner/Admin may revoke', 403);
    invite.status = 'Revoked';
    await invite.save();
    res.json({ message: 'Invite revoked' });
}));

export default router;
