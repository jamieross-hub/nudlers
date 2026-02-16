import { getDB } from "../db";
import VaultStore from "../utils/VaultStore";
import { getLegacyKey } from "../utils/encryption";

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).end();
    }

    res.setHeader('Cache-Control', 'no-store, max-age=0');

    try {
        const client = await getDB();
        const result = await client.query("SELECT value FROM app_settings WHERE key = 'wrapped_master_key'");
        client.release();

        const dbKey = result.rows[0]?.value;
        let isInitialized = false;
        if (typeof dbKey === 'string' && dbKey.length > 0) {
            try {
                const parsed = JSON.parse(dbKey);
                isInitialized = (typeof parsed === 'string' && parsed.length > 0);
            } catch (e) {
                isInitialized = (dbKey.length > 0);
            }
        }

        // Update VaultStore state
        VaultStore.setInitialized(isInitialized);

        const hasLegacyKey = getLegacyKey() !== null;

        res.status(200).json({
            locked: VaultStore.isLocked(),
            initialized: isInitialized,
            needsMigration: hasLegacyKey && !isInitialized
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to check vault status' });
    }
}
