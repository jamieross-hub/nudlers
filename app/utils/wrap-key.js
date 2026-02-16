import crypto from 'crypto';
import process from 'process';

/**
 * Utility to wrap a master key with a passphrase.
 * Usage: node wrap-key.js <hex-master-key> <passphrase>
 */

let masterKey;
let masterKeyHex = process.argv[2];
const passphrase = process.argv[3];
const salt = 'nudlers-vault-salt';

if (!masterKeyHex || !passphrase) {
    console.log('Usage:');
    console.log('  Generate new key: node app/utils/wrap-key.js new <passphrase>');
    console.log('  Wrap hex key:     node app/utils/wrap-key.js <hex-master-key> <passphrase>');
    process.exit(1);
}

if (masterKeyHex.toLowerCase() === 'new') {
    masterKey = crypto.randomBytes(32);
    console.log('Generated new random master key.');
} else {
    masterKey = Buffer.from(masterKeyHex, 'hex');
    if (masterKey.length !== 32) {
        console.error('Master key must be 32 bytes (64 hex characters)');
        process.exit(1);
    }
}


const wrappingKey = crypto.scryptSync(passphrase, salt, 32);
const iv = crypto.randomBytes(12);
const cipher = crypto.createCipheriv('aes-256-gcm', wrappingKey, iv);

let wrapped = cipher.update(masterKey);
wrapped = Buffer.concat([wrapped, cipher.final()]);
const authTag = cipher.getAuthTag();

const wrappedMasterKeyStr = `${iv.toString('hex')}:${wrapped.toString('hex')}:${authTag.toString('hex')}`;

console.log('--- WRAPPED MASTER KEY ---');
console.log(wrappedMasterKeyStr);
console.log('--------------------------');
console.log('\nStore this securely in your database in the app_settings table with key "wrapped_master_key".');

