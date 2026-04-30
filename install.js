#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log(`
+------------------------------------------------------+
|  Discord AutoTool - Installation                     |
|  Version 1.0.0                                       |
+------------------------------------------------------+
`);

const nodeVersion = process.version;
console.log(`[OK] Node.js detecte: ${nodeVersion}`);

try {
    const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
    console.log(`[OK] npm detecte: ${npmVersion}`);
} catch (err) {
    console.error('[X] npm non trouve!');
    process.exit(1);
}

const configDir = path.join(__dirname, 'config');
if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
    console.log('[OK] Dossier /config cree');
}

console.log('\n[SUCCESS] Installation reussie!\n');
console.log('Pour lancer l\'outil:\n');
console.log('  npm start\n');
console.log('Ou double-cliquez sur start.bat\n');
