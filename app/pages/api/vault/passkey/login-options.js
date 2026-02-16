import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { getDB } from '../../db';

const rpID = 'localhost';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const db = await getDB();

        // Get all registered credentials for the user (everyone is 'user' for now)
        const credentialsResult = await db.query("SELECT credential_id, transports FROM vault_passkeys");

        const options = await generateAuthenticationOptions({
            rpID,
            allowCredentials: credentialsResult.rows.map(row => ({
                id: row.credential_id,
                transports: typeof row.transports === 'string' ? JSON.parse(row.transports) : (row.transports || []),
            })),
            userVerification: 'preferred',
        });

        // Store challenge for verification
        await db.query(`
      INSERT INTO app_settings (key, value, description) 
      VALUES ($1, $2, $3) 
      ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP
    `, ['passkey_authentication_challenge', JSON.stringify(options.challenge), 'Temporary challenge for passkey authentication']);

        db.release();
        return res.status(200).json(options);
    } catch (error) {
        console.error('Failed to generate authentication options:', error);
        return res.status(500).json({ error: error.message });
    }
}
