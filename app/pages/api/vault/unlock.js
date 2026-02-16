import { unlockVaultWithPassphrase } from '../../../utils/vault-utils';
import logger from '../../../utils/logger.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ error: `Method ${req.method} not allowed` });
    }

    const { passphrase } = req.body;

    if (!passphrase) {
        return res.status(400).json({ error: 'Passphrase is required' });
    }

    const result = await unlockVaultWithPassphrase(passphrase);

    if (result.success) {
        logger.info("Vault unlocked successfully");
        res.status(200).json({ success: true, message: 'Vault unlocked' });
    } else {
        res.status(401).json({ error: result.error });
    }
}
