import { generateRegistrationOptions } from '@simplewebauthn/server';
import { getDB } from '../../db';

const rpName = 'Nudlers Finance';
const rpID = 'localhost'; // Should be the domain, e.g., 'nudlers.finance' in production
const origin = 'http://localhost:6969'; // Should match the frontend origin

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const options = await generateRegistrationOptions({
            rpName,
            rpID,
            userID: Buffer.from('user'), // For simplicity, we use a single user identifier for now
            userName: 'user@nudlers.finance',
            attestationType: 'none',
            authenticatorSelection: {
                residentKey: 'preferred',
                userVerification: 'preferred',
            },
        });

        // We need to store some session state for the verification step.
        // For now, since we don't have sessions, we might store it in the DB temporarily 
        // or just rely on the client sending it back (not ideal for security, but okay for MVP).
        // Actually, SimpleWebAuthn requires the challenge to be verified.

        // Let's store the challenge in app_settings temporarily with a prefix
        const db = await getDB();
        await db.query(`
      INSERT INTO app_settings (key, value, description) 
      VALUES ($1, $2, $3) 
      ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP
    `, ['passkey_registration_challenge', JSON.stringify(options.challenge), 'Temporary challenge for passkey registration']);
        db.release();

        return res.status(200).json(options);
    } catch (error) {
        console.error('Failed to generate registration options:', error);
        return res.status(500).json({ error: error.message });
    }
}
