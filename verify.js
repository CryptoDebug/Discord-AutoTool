#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const filesToCheck = [
    'src/main.js',
    'src/cli/cli-mode.js',
    'src/gui/app.js',
    'src/config/manager.js',
    'src/features/logging.js',
    'src/features/autobump/bumper.js',
    'src/features/autosender/sender.js',
    'src/gui/views/index.ejs',
    'src/gui/views/bump.ejs',
    'src/gui/views/sender.ejs',
    'src/gui/views/tokens.ejs',
    'src/gui/views/webhooks.ejs',
    'src/gui/views/layout.ejs',
    'src/gui/views/header.ejs',
    'src/gui/views/nav.ejs',
    'src/gui/views/footer.ejs',
    'src/gui/public/css/style.css',
    'src/gui/public/js/main.js',
    'package.json',
    'start.bat',
    'build.bat',
    'README.md',
    'QUICKSTART.md',
    'SUMMARY.md',
    'ARCHITECTURE.md',
    'START.md',
    '.gitignore'
];

async function checkFile(file) {
    try {
        const fullPath = path.join(__dirname, file);
        const stat = await fs.stat(fullPath);
        if (stat.isFile()) {
            console.log(chalk.green('[OK]'), file);
            return true;
        }
    } catch (err) {
        console.log(chalk.red('[X]'), file, '(manquant)');
        return false;
    }
    return false;
}

async function verify() {
    console.log(chalk.bold.cyan(`
+----------------------------------------+
|  Discord AutoTool - Verification       |
+----------------------------------------+
    `));

    console.log(chalk.blue('[INFO] Verification des fichiers...\n'));

    let passed = 0;
    let failed = 0;

    for (const file of filesToCheck) {
        if (await checkFile(file)) {
            passed++;
        } else {
            failed++;
        }
    }

    console.log(`\n${chalk.blue('-'.repeat(40))}\n`);

    if (failed === 0) {
        console.log(chalk.green.bold(`[OK] ${passed} fichiers OK\n`));
        console.log(chalk.green('[SUCCESS] Installation reussie!\n'));
        console.log(chalk.blue('Prochaines etapes:'));
        console.log('  1. npm install');
        console.log('  2. npm start');
        console.log('  3. Ouvrir http://localhost:3000\n');
    } else {
        console.log(chalk.red.bold(`[X] ${failed} fichier(s) manquant(s)\n`));
        console.log(chalk.yellow('Veuillez verifier l\'installation\n'));
    }
}

verify().catch(err => {
    console.error(chalk.red('Erreur:'), err);
    process.exit(1);
});
