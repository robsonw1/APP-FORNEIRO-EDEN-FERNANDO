import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

/**
 * Generates a version hash based on the current timestamp and a random value.
 * This ensures every build gets a new version, forcing cache invalidation.
 * 
 * The version is written to public/version.json which is then used by the SW.
 */

// Generate version: timestamp + short hash
const timestamp = Date.now();
const random = crypto.randomBytes(4).toString('hex');
const VERSION = `${timestamp}-${random}`.substring(0, 20);

const versionFile = path.resolve('public/version.json');

const versionData = {
  version: VERSION,
  timestamp: new Date().toISOString(),
  built: new Date().toLocaleString('pt-BR'),
};

// Ensure directory exists
const dir = path.dirname(versionFile);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

// Write version file
fs.writeFileSync(versionFile, JSON.stringify(versionData, null, 2));

console.log(`✅ Version generated: ${VERSION}`);
console.log(`📝 Written to: ${versionFile}`);
