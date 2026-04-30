#!/usr/bin/env node
import chalk from 'chalk';
import inquirer from 'inquirer';
import { startGUI } from './gui/app.js';
import { startCLI } from './cli/cli-mode.js';
import { ConfigManager } from './config/manager.js';

async function main() {
    console.clear();
    console.log(chalk.bold.cyan(`
    ============================================================
       DISCORD AUTO-TOOL - Bump & Sender
       Version 1.0.0
    ============================================================
    `));

    const configManager = new ConfigManager();
    await configManager.initialize();

    let selectedInterface = null;

    if (process.argv.includes('--gui')) {
        selectedInterface = 'gui';
    } else if (process.argv.includes('--cli')) {
        selectedInterface = 'cli';
    }

    if (!selectedInterface) {
        const answers = await inquirer.prompt([
            {
                type: 'list',
                name: 'interface',
                message: 'Choisir l\'interface:',
                choices: [
                    { name: 'GUI (Web - localhost:3000)', value: 'gui' },
                    { name: 'CLI (Terminal)', value: 'cli' }
                ],
                default: 'gui'
            }
        ]);

        selectedInterface = answers.interface;
    }

    if (selectedInterface === 'gui') {
        console.log(chalk.blue('\n-> Démarrage de la GUI web...\n'));
        await startGUI();
    } else {
        console.log(chalk.blue('\n-> Démarrage du mode CLI...\n'));
        await startCLI();
    }
}

main().catch(err => {
    console.error(chalk.red('Erreur:'), err);
    process.exit(1);
});
