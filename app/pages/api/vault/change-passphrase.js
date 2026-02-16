import crypto from 'crypto';
import { getDB } from '../db';
import VaultStore from '../utils/VaultStore';
import logger from '../../../utils/logger.js';

const SALT = 'nudlers-vault-salt';

/**
 * Unwrap the master key using a passphrase.
 * Returns the decrypted master key Buffer or throws on failure.
 */
function unwrapMasterKey(wrappedKeyStr, passphrase) {
    const wrappingKey = crypto.scryptSync(passphrase, SALT, 32);

    const [ivHex, encryptedData, authTagHex] = wrappedKeyStr.split(':');
    if (!ivHex || !encryptedData || !authTagHex) {
        throw new Error('Invalid wrapped key format');
    }

    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', wrappingKey, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedData, 'hex');
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    wrappingKey.fill(0);
    return decrypted;
}

/**
 * Wrap the master key with a new passphrase.
 * Returns the wrapped key string in format: iv:encrypted:authTag
 */
function wrapMasterKey(masterKey, passphrase) {
    const wrappingKey = crypto.scryptSync(passphrase, SALT, 32);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', wrappingKey, iv);

    const wrapped = Buffer.concat([cipher.update(masterKey), cipher.final()]);
    const authTag = cipher.getAuthTag();

    wrappingKey.fill(0);
    return `${iv.toString('hex')}:${wrapped.toString('hex')}:${authTag.toString('hex')}`;
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ error: `Method ${req.method} not allowed` });
    }

    if (VaultStore.isLocked()) {
        return res.status(403).json({ error: 'Vault must be unlocked to change passphrase' });
    }

    const { currentPassphrase, newPassphrase } = req.body;

    if (!currentPassphrase || !newPassphrase) {
        return res.status(400).json({ error: 'Both current and new passphrase are required' });
    }

    if (newPassphrase.length < 8) {
        return res.status(400).json({ error: 'New passphrase must be at least 8 characters long' });
    }

    if (currentPassphrase === newPassphrase) {
        return res.status(400).json({ error: 'New passphrase must be different from the current one' });
    }

    try {
        const client = await getDB();

        // 1. Get the current wrapped master key
        const result = await client.query("SELECT value FROM app_settings WHERE key = 'wrapped_master_key'");
        const dbKey = result.rows[0]?.value;

        if (!dbKey) {
            client.release();
            return res.status(400).json({ error: 'Vault is not initialized' });
        }

        let wrappedKeyStr;
        try {
            wrappedKeyStr = JSON.parse(dbKey);
        } catch {
            wrappedKeyStr = dbKey;
        }

        // 2. Verify current passphrase by unwrapping
        let masterKey;
        try {
            masterKey = unwrapMasterKey(wrappedKeyStr, currentPassphrase);
        } catch {
            client.release();
            return res.status(401).json({ error: 'Current passphrase is incorrect' });
        }

        // 3. Re-wrap with new passphrase
        const newWrappedStr = wrapMasterKey(masterKey, newPassphrase);
        masterKey.fill(0);

        // 4. Save to DB
        await client.query(
            "UPDATE app_settings SET value = $1 WHERE key = 'wrapped_master_key'",
            [JSON.stringify(newWrappedStr)]
        );

        // 5. Delete all passkeys (they store encrypted copies of the old passphrase)
        const passkeysResult = await client.query('DELETE FROM vault_passkeys');
        const passkeysCleared = passkeysResult.rowCount || 0;

        client.release();

        logger.info({ passkeysCleared }, 'Passphrase changed successfully, passkeys invalidated');

        res.status(200).json({
            success: true,
            message: 'Passphrase changed successfully',
            passkeysCleared
        });
    } catch (err) {
        logger.error({ error: err.message }, 'Failed to change passphrase');
        res.status(500).json({ error: 'Failed to change passphrase' });
    }
}
