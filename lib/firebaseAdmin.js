import logger from '../utils/logger.js';

let adminApp = null;

/**
 * Initializes Firebase Admin SDK if service account is available.
 */
export async function getFirebaseAdmin() {
    if (adminApp) return adminApp;

    try {
        const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
        if (serviceAccountJson) {
            const admin = await import('firebase-admin');
            const credentials = typeof serviceAccountJson === 'string' && serviceAccountJson.startsWith('{')
                ? JSON.parse(serviceAccountJson)
                : serviceAccountJson;

            adminApp = admin.default.initializeApp({
                credential: admin.default.credential.cert(credentials),
                projectId: process.env.FIREBASE_PROJECT_ID || credentials.project_id,
            });
            logger.info('Firebase Admin SDK initialized successfully');
            return adminApp;
        }
    } catch (err) {
        logger.warn('Firebase Admin SDK initialization skipped, using Google Public Key verification fallback', {
            error: err.message,
        });
    }

    return null;
}

/**
 * Verifies a Firebase ID token.
 * 1. Attempts Firebase Admin SDK verification if initialized.
 * 2. Falls back to Google Identity Toolkit & OAuth2 TokenInfo verification.
 */
export async function verifyFirebaseIdToken(token) {
    if (!token || typeof token !== 'string') {
        throw new Error('Token must be a non-empty string');
    }

    // 1. Try Firebase Admin SDK
    const admin = await getFirebaseAdmin();
    if (admin) {
        try {
            const decodedToken = await admin.auth().verifyIdToken(token, true);
            return {
                uid: decodedToken.uid,
                email: (decodedToken.email || '').toLowerCase(),
                displayName: decodedToken.name || '',
                isGuest: false,
            };
        } catch (adminErr) {
            logger.warn('Firebase Admin verification failed, falling back to Google endpoints', {
                error: adminErr.message,
            });
        }
    }

    // 2. Google Identity Toolkit REST API
    const firebaseApiKey = process.env.FIREBASE_API_KEY;
    if (firebaseApiKey) {
        try {
            const fbRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseApiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idToken: token }),
            });

            if (fbRes.ok) {
                const userData = await fbRes.json();
                if (userData.users && userData.users[0]) {
                    const fbUser = userData.users[0];
                    return {
                        uid: fbUser.localId,
                        email: (fbUser.email || '').toLowerCase(),
                        displayName: fbUser.displayName || '',
                        isGuest: false,
                    };
                }
            }
        } catch (fetchErr) {
            logger.debug('Identity toolkit lookup failed, trying tokeninfo', { error: fetchErr.message });
        }
    }

    // 3. Google OAuth2 TokenInfo endpoint fallback
    const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`);
    if (response.ok) {
        const payload = await response.json();
        const expectedProjectId = process.env.FIREBASE_PROJECT_ID;

        if (!expectedProjectId || payload.aud === expectedProjectId) {
            return {
                uid: payload.sub || payload.user_id,
                email: (payload.email || '').toLowerCase(),
                displayName: payload.name || '',
                isGuest: false,
            };
        }
    }

    throw new Error('Invalid or expired authentication token');
}

export default { getFirebaseAdmin, verifyFirebaseIdToken };
