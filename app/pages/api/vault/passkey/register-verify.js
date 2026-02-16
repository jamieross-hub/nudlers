import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { getDB } from '../../db';
import crypto from 'crypto';

const rpID = 'localhost';
const origin = 'http://localhost:6969';

// Server-side secret to encrypt the passphrase before storing in DB
const PASSKEY_ENCRYPTION_SECRET = process.env.PASSKEY_ENCRYPTION_SECRET || 'nudlers-passkey-default-secret-change-it';

function encryptPassphrase(passphrase) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', crypto.scryptSync(PASSKEY_ENCRYPTION_SECRET, 'salt', 32), iv);
    let encrypted = cipher.update(passphrase, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${encrypted}:${tag}`;
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { registrationResponse, passphrase } = req.body;

    if (!registrationResponse || !passphrase) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        const db = await getDB();

        // 1. Get the challenge we stored
        const challengeResult = await db.query("SELECT value FROM app_settings WHERE key = 'passkey_registration_challenge'");
        if (challengeResult.rows.length === 0) {
            db.release();
            return res.status(400).json({ error: 'Registration challenge not found or expired' });
        }
        const expectedChallenge = challengeResult.rows[0].value;

        // 2. Verify registration response
        const verification = await verifyRegistrationResponse({
            response: registrationResponse,
            expectedChallenge,
            expectedOrigin: origin,
            expectedRPID: rpID,
        });

        if (verification.verified) {
            const { registrationInfo } = verification;
            const { credential } = registrationInfo;
            const { id: credentialID, publicKey: credentialPublicKey, counter } = credential;

            // 3. Encrypt the passphrase
            const encryptedPassphrase = encryptPassphrase(passphrase);

            // 4. Store the credential
            await db.query(`
        INSERT INTO vault_passkeys (credential_id, public_key, counter, transports, encrypted_passphrase)
        VALUES ($1, $2, $3, $4, $5)
      `, [
                registrationResponse.id,
                Buffer.from(credentialPublicKey),
                counter,
                JSON.stringify(registrationResponse.response.transports || []),
                encryptedPassphrase
            ]);

            // Cleanup challenge
            await db.query("DELETE FROM app_settings WHERE key = 'passkey_registration_challenge'");

            db.release();
            return res.status(200).json({ verified: true });
        } else {
            db.release();
            return res.status(400).json({ verified: false, error: 'Verification failed' });
        }
    } catch (error) {
        console.error('Registration verification failed:', error);
        return res.status(500).json({ error: error.message });
    }
}
