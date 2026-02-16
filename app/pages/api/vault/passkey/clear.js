import { getDB } from '../../db';
import VaultStore from '../../utils/VaultStore';
import logger from '../../../../utils/logger.js';

export default async function handler(req, res) {
    if (req.method !== 'DELETE') {
        res.setHeader('Allow', ['DELETE']);
        return res.status(405).json({ error: `Method ${req.method} not allowed` });
    }

    if (VaultStore.isLocked()) {
        return res.status(403).json({ error: 'Vault must be unlocked to manage passkeys' });
    }

    try {
        const db = await getDB();
        const result = await db.query('DELETE FROM vault_passkeys');
        db.release();

        const cleared = result.rowCount || 0;
        logger.info({ cleared }, 'All passkeys cleared');

        res.status(200).json({ success: true, cleared });
    } catch (err) {
        logger.error({ error: err.message }, 'Failed to clear passkeys');
        res.status(500).json({ error: 'Failed to clear passkeys' });
    }
}
