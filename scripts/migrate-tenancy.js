import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Organization from '../models/Organization.js';
import OrganizationMember from '../models/OrganizationMember.js';
import CompanyProfile from '../models/CompanyProfile.js';
import Product from '../models/Product.js';
import Import from '../models/Import.js';
import RFQ from '../models/RFQ.js';
import Dispute from '../models/Dispute.js';
import logger from '../utils/logger.js';

dotenv.config();

function slugify(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'org';
}

export async function runTenancyMigration() {
    logger.info('Starting Tenancy Migration & Legacy Data Backfill...');

    // 1. Gather all unique user emails
    const profileEmails = await CompanyProfile.distinct('userEmail');
    const productEmails = await Product.distinct('exporterEmail');
    const importEmails = await Import.distinct('userEmail');
    const rfqBuyerEmails = await RFQ.distinct('buyerEmail');
    const rfqExporterEmails = await RFQ.distinct('exporterEmail');

    const allEmails = Array.from(new Set([
        ...profileEmails,
        ...productEmails,
        ...importEmails,
        ...rfqBuyerEmails,
        ...rfqExporterEmails,
    ])).filter(Boolean).map(e => e.toLowerCase().trim());

    logger.info(`Found ${allEmails.length} unique entity email addresses across legacy collections`);

    const userOrgMap = new Map(); // email -> Organization ObjectId

    // 2. Provision or resolve Organization for each user
    for (const email of allEmails) {
        // Check if user already owns or belongs to an active organization
        let membership = await OrganizationMember.findOne({ email, status: 'Active' }).populate('orgId');
        let org = membership ? membership.orgId : null;

        if (!org) {
            org = await Organization.findOne({ billingEmail: email });
        }

        if (!org) {
            // Check company profile for legal name
            const profile = await CompanyProfile.findOne({ userEmail: email });
            const companyName = profile?.companyLegalName || `${email.split('@')[0]} Trading Group`;
            const short = new mongoose.Types.ObjectId().toString().slice(-4);
            const slug = `${slugify(companyName)}-${short}`;

            org = await Organization.create({
                legalName: companyName,
                slug,
                type: 'Both',
                country: 'Global',
                billingEmail: email,
                ownerUserId: profile?.userId || `user-${short}`,
                kybStatus: profile?.kybStatus || 'Pending',
                settings: {
                    settlementCurrency: profile?.settlementCurrency || 'USD',
                    portOfPreference: profile?.portOfPreference || '',
                    swiftBic: profile?.swiftBic || '',
                },
                members: [{ email, role: 'Owner', joinedAt: new Date() }],
            });

            await OrganizationMember.create({
                orgId: org._id,
                userId: org.ownerUserId,
                email,
                orgRole: 'Owner',
                tradeRoles: ['ProcurementManager', 'ExportManager', 'FinanceController', 'InventoryManager'],
                status: 'Active',
                invitedBy: 'SYSTEM_MIGRATION',
            });

            logger.info(`Provisioned default organization for ${email}: ${org.legalName} (${org.slug})`);
        }

        userOrgMap.set(email, org._id);
    }

    // 3. Backfill Products
    let backfilledProducts = 0;
    const products = await Product.find({ $or: [{ organizationId: null }, { organizationId: { $exists: false } }] });
    for (const prod of products) {
        const orgId = prod.exporterEmail ? userOrgMap.get(prod.exporterEmail.toLowerCase()) : null;
        if (orgId) {
            prod.organizationId = orgId;
            prod.orgId = orgId;
            await prod.save();
            backfilledProducts++;
        }
    }
    logger.info(`Backfilled ${backfilledProducts} legacy Products with organizationId`);

    // 4. Backfill Imports / Purchase Orders
    let backfilledImports = 0;
    const imports = await Import.find({
        $or: [
            { buyerOrganizationId: null },
            { buyerOrganizationId: { $exists: false } },
            { supplierOrganizationId: null },
            { supplierOrganizationId: { $exists: false } },
        ]
    }).populate('productId');

    for (const imp of imports) {
        const buyerOrgId = imp.userEmail ? userOrgMap.get(imp.userEmail.toLowerCase()) : null;
        const exporterEmail = imp.productId?.exporterEmail;
        const supplierOrgId = exporterEmail ? userOrgMap.get(exporterEmail.toLowerCase()) : null;

        let changed = false;
        if (buyerOrgId && !imp.buyerOrganizationId) {
            imp.buyerOrganizationId = buyerOrgId;
            imp.organizationId = buyerOrgId;
            imp.orgId = buyerOrgId;
            changed = true;
        }
        if (supplierOrgId && !imp.supplierOrganizationId) {
            imp.supplierOrganizationId = supplierOrgId;
            imp.sellerOrgId = supplierOrgId;
            changed = true;
        }
        if (changed) {
            await imp.save();
            backfilledImports++;
        }
    }
    logger.info(`Backfilled ${backfilledImports} legacy Imports with bilateral organization IDs`);

    // 5. Backfill RFQs
    let backfilledRFQs = 0;
    const rfqs = await RFQ.find({
        $or: [
            { buyerOrganizationId: null },
            { buyerOrganizationId: { $exists: false } },
            { supplierOrganizationId: null },
            { supplierOrganizationId: { $exists: false } },
        ]
    });

    for (const rfq of rfqs) {
        const buyerOrgId = rfq.buyerEmail ? userOrgMap.get(rfq.buyerEmail.toLowerCase()) : null;
        const supplierOrgId = rfq.exporterEmail ? userOrgMap.get(rfq.exporterEmail.toLowerCase()) : null;

        let changed = false;
        if (buyerOrgId && !rfq.buyerOrganizationId) {
            rfq.buyerOrganizationId = buyerOrgId;
            rfq.organizationId = buyerOrgId;
            rfq.orgId = buyerOrgId;
            changed = true;
        }
        if (supplierOrgId && !rfq.supplierOrganizationId) {
            rfq.supplierOrganizationId = supplierOrgId;
            rfq.sellerOrgId = supplierOrgId;
            changed = true;
        }
        if (changed) {
            await rfq.save();
            backfilledRFQs++;
        }
    }
    logger.info(`Backfilled ${backfilledRFQs} legacy RFQs with bilateral organization IDs`);

    // 6. Backfill Disputes
    let backfilledDisputes = 0;
    const disputes = await Dispute.find({
        $or: [
            { claimantOrganizationId: null },
            { claimantOrganizationId: { $exists: false } },
        ]
    });

    for (const disp of disputes) {
        const claimantOrgId = disp.claimantEmail ? userOrgMap.get(disp.claimantEmail.toLowerCase()) : null;
        const respondentOrgId = disp.respondentEmail ? userOrgMap.get(disp.respondentEmail.toLowerCase()) : null;

        let changed = false;
        if (claimantOrgId && !disp.claimantOrganizationId) {
            disp.claimantOrganizationId = claimantOrgId;
            disp.organizationId = claimantOrgId;
            disp.orgId = claimantOrgId;
            changed = true;
        }
        if (respondentOrgId && !disp.respondentOrganizationId) {
            disp.respondentOrganizationId = respondentOrgId;
            changed = true;
        }
        if (changed) {
            await disp.save();
            backfilledDisputes++;
        }
    }
    logger.info(`Backfilled ${backfilledDisputes} legacy Disputes with bilateral organization IDs`);

    logger.info('Tenancy migration completed successfully!');
    return {
        usersProvisioned: allEmails.length,
        backfilledProducts,
        backfilledImports,
        backfilledRFQs,
        backfilledDisputes,
    };
}

// Standalone execution entrypoint
if (process.argv[1] && process.argv[1].endsWith('migrate-tenancy.js')) {
    if (!process.env.MONGODB_URI) {
        console.error('MONGODB_URI required in .env');
        process.exit(1);
    }
    mongoose.connect(process.env.MONGODB_URI)
        .then(async () => {
            await runTenancyMigration();
            await mongoose.disconnect();
            process.exit(0);
        })
        .catch(err => {
            console.error('Migration failed:', err);
            process.exit(1);
        });
}

export default runTenancyMigration;
