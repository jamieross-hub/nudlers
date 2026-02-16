import crypto from 'crypto';
import { getDB } from '../pages/api/db';
import VaultStore from '../pages/api/utils/VaultStore';
import logger from './logger.js';

/**
 * Core logic to unlock the vault with a passphrase.
 * Returns { success: boolean, error?: string }
 */
export async function unlockVaultWithPassphrase(passphrase) {
    if (!passphrase) {
        return { success: false, error: 'Passphrase is required' };
    }

    let wrappedKey;

    try {
        const client = await getDB();
        const result = await client.query("SELECT value FROM app_settings WHERE key = 'wrapped_master_key'");
        client.release();
        const dbKey = result.rows[0]?.value;
        if (typeof dbKey === 'string' && dbKey.length > 0) {
            try {
                wrappedKey = JSON.parse(dbKey);
            } catch (e) {
                wrappedKey = dbKey;
            }
        }
    } catch (err) {
        logger.error({ error: err.message }, "Failed to read vault key from DB");
        return { success: false, error: 'Failed to access vault configuration' };
    }

    if (!wrappedKey) {
        return { success: false, error: 'Vault is not initialized (no key found in database)' };
    }

    try {
        const salt = 'nudlers-vault-salt';
        const wrappingKey = crypto.scryptSync(passphrase, salt, 32);

        const [ivHex, encryptedData, authTagHex] = wrappedKey.split(':');
        if (!ivHex || !encryptedData || !authTagHex) {
            throw new Error('Invalid wrapped key format');
        }

        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-gcm', wrappingKey, iv);
        decipher.setAuthTag(authTag);

        let decryptedMasterKey = decipher.update(encryptedData, 'hex');
        decryptedMasterKey = Buffer.concat([decryptedMasterKey, decipher.final()]);

        VaultStore.setKey(decryptedMasterKey);
        wrappingKey.fill(0);

        return { success: true };
    } catch (err) {
        logger.error({ error: err.message }, "Failed to unlock vault");
        return { success: false, error: 'Invalid passphrase or corrupted master key' };
    }
}
