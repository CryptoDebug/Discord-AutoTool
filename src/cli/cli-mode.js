import chalk from 'chalk';
import inquirer from 'inquirer';
import { ConfigManager } from '../config/manager.js';
import { AutoBumper } from '../features/autobump/bumper.js';
import { AutoSender } from '../features/autosender/sender.js';
import { Logger } from '../features/logging.js';

export async function startCLI() {
    const configManager = new ConfigManager();
    const logger = new Logger();
    const autoBumper = new AutoBumper();
    const autoSender = new AutoSender();

    await configManager.initialize();
    await logger.initialize();
    await autoBumper.initialize();
    await autoSender.initialize();

    let running = true;

    while (running) {
        console.log('');
        const answers = await inquirer.prompt([
            {
                type: 'list',
                name: 'mode',
                message: 'Choisir le mode:',
                choices: [
                    { name: 'AutoBump', value: 'bump' },
                    { name: 'AutoSender', value: 'sender' },
                    { name: 'Gestion Tokens', value: 'tokens' },
                    { name: 'Configuration Webhooks', value: 'webhooks' },
                    { name: 'Quitter', value: 'quit' }
                ]
            }
        ]);

        switch (answers.mode) {
            case 'bump':
                await handleBumpCLI(configManager, autoBumper, logger);
                break;
            case 'sender':
                await handleSenderCLI(configManager, autoSender, logger);
                break;
            case 'tokens':
                await handleTokensCLI(configManager);
                break;
            case 'webhooks':
                await handleWebhooksCLI(configManager);
                break;
            case 'quit':
                running = false;
                console.log(chalk.yellow('\nÀ bientôt!\n'));
                break;
        }
    }

    process.exit(0);
}

async function handleBumpCLI(configManager, autoBumper, logger) {
    let inBumpMenu = true;

    while (inBumpMenu) {
        const config = await configManager.read('bump');
        const answers = await inquirer.prompt([
            {
                type: 'list',
                name: 'action',
                message: 'AutoBump - Actions:',
                choices: [
                    { name: `Voir les serveurs (${config.servers?.length || 0})`, value: 'list' },
                    { name: 'Ajouter un serveur', value: 'add' },
                    { name: 'Supprimer un serveur', value: 'remove' },
                    { name: 'Paramètres', value: 'settings' },
                    { name: 'Démarrer', value: 'start' },
                    { name: 'Arrêter', value: 'stop' },
                    { name: 'Retour', value: 'back' }
                ]
            }
        ]);

        switch (answers.action) {
            case 'list':
                if (config.servers && config.servers.length > 0) {
                    console.log(chalk.cyan('\nServeurs configurés:'));
                    config.servers.forEach((s, i) => {
                        console.log(`  ${i + 1}. ${s.name} (${s.serverId}) - ${s.enabled ? '[ON]' : '[OFF]'}`);
                    });
                    console.log('');
                } else {
                    console.log(chalk.yellow('\n[!] Aucun serveur configuré\n'));
                }
                break;

            case 'add':
                await addBumpServer(configManager);
                break;

            case 'remove':
                await removeBumpServer(configManager);
                break;

            case 'settings':
                await configureBumpSettings(configManager);
                break;

            case 'start':
                config.enabled = true;
                await configManager.write('bump', config);
                await autoBumper.startBumping();
                console.log(chalk.green('\n[OK] AutoBump démarré!\n'));
                break;

            case 'stop':
                config.enabled = false;
                await configManager.write('bump', config);
                await autoBumper.stopAll();
                console.log(chalk.red('\n[STOP] AutoBump arrêté!\n'));
                break;

            case 'back':
                inBumpMenu = false;
                break;
        }
    }
}

async function addBumpServer(configManager) {
    const tokensConfig = await configManager.read('tokens');

    if (!tokensConfig.tokens || tokensConfig.tokens.length === 0) {
        console.log(chalk.red('\n[X] Aucun token configuré!\n'));
        return;
    }

    const answers = await inquirer.prompt([
        {
            type: 'input',
            name: 'serverId',
            message: 'ID du serveur:',
            validate: (val) => val.length > 0 ? true : 'Entrez un ID'
        },
        {
            type: 'input',
            name: 'bumpChannelId',
            message: 'ID du salon bump:',
            validate: (val) => val.length > 0 ? true : 'Entrez un ID'
        },
        {
            type: 'list',
            name: 'tokenId',
            message: 'Token à utiliser:',
            choices: tokensConfig.tokens.map(t => ({
                name: `${t.name} (${t.group})`,
                value: t.id
            }))
        },
        {
            type: 'input',
            name: 'name',
            message: 'Nom du serveur (optionnel):'
        }
    ]);

    const config = await configManager.read('bump');
    config.servers.push({
        id: Date.now().toString(),
        ...answers,
        enabled: true,
        createdAt: new Date().toISOString()
    });

    await configManager.write('bump', config);
    console.log(chalk.green('\n[OK] Serveur ajouté!\n'));
}

async function removeBumpServer(configManager) {
    const config = await configManager.read('bump');

    if (!config.servers || config.servers.length === 0) {
        console.log(chalk.yellow('\n[!] Aucun serveur à supprimer\n'));
        return;
    }

    const answers = await inquirer.prompt([
        {
            type: 'list',
            name: 'serverId',
            message: 'Serveur à supprimer:',
            choices: config.servers.map((s, i) => ({
                name: `${s.name} (${s.serverId})`,
                value: s.id
            }))
        }
    ]);

    config.servers = config.servers.filter(s => s.id !== answers.serverId);
    await configManager.write('bump', config);
    console.log(chalk.green('\n[OK] Serveur supprimé!\n'));
}

async function configureBumpSettings(configManager) {
    const config = await configManager.read('bump');

    const answers = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'humanize',
            message: 'Activer l’humanisation (1-15 min aléatoires)?',
            default: config.settings.humanize
        },
        {
            type: 'number',
            name: 'humanizeMin',
            message: 'Min humanization (minutes):',
            default: config.settings.humanizeMin,
            when: (ans) => ans.humanize
        },
        {
            type: 'number',
            name: 'humanizeMax',
            message: 'Max humanization (minutes):',
            default: config.settings.humanizeMax,
            when: (ans) => ans.humanize
        },
        {
            type: 'number',
            name: 'maxServersPerToken',
            message: 'Max serveurs par token:',
            default: config.settings.maxServersPerToken
        }
    ]);

    config.settings = {
        humanize: answers.humanize,
        humanizeMin: answers.humanizeMin || config.settings.humanizeMin,
        humanizeMax: answers.humanizeMax || config.settings.humanizeMax,
        maxServersPerToken: answers.maxServersPerToken
    };

    await configManager.write('bump', config);
    console.log(chalk.green('\n[OK] Paramètres enregistrés!\n'));
}

async function handleSenderCLI(configManager, autoSender, logger) {
    console.log(chalk.cyan('\nAutoSender - Mode CLI en développement...\n'));
}

async function handleTokensCLI(configManager) {
    let inTokenMenu = true;

    while (inTokenMenu) {
        const config = await configManager.read('tokens');
        const groupsConfig = await configManager.read('groups');

        const answers = await inquirer.prompt([
            {
                type: 'list',
                name: 'action',
                message: 'Gestion Tokens:',
                choices: [
                    { name: `Voir les tokens (${config.tokens?.length || 0})`, value: 'list' },
                    { name: 'Ajouter un token', value: 'add' },
                    { name: 'Supprimer un token', value: 'remove' },
                    { name: 'Gérer les groupes', value: 'groups' },
                    { name: 'Retour', value: 'back' }
                ]
            }
        ]);

        switch (answers.action) {
            case 'list':
                if (config.tokens && config.tokens.length > 0) {
                    console.log(chalk.cyan('\nTokens:'));
                    config.tokens.forEach((t, i) => {
                        console.log(`  ${i + 1}. ${t.name} [${t.group}] - ${t.token.substring(0, 15)}...`);
                    });
                    console.log('');
                } else {
                    console.log(chalk.yellow('\n[!] Aucun token\n'));
                }
                break;

            case 'add':
                const tokenAnswers = await inquirer.prompt([
                    {
                        type: 'password',
                        name: 'token',
                        message: 'Token Discord:',
                        validate: (val) => val.length > 20 ? true : 'Token invalide'
                    },
                    {
                        type: 'input',
                        name: 'name',
                        message: 'Nom (optionnel):'
                    },
                    {
                        type: 'list',
                        name: 'group',
                        message: 'Groupe:',
                        choices: [...(groupsConfig.tokenGroups || []), 'default']
                    }
                ]);

                await configManager.addToken(tokenAnswers.token, tokenAnswers.name, tokenAnswers.group);
                console.log(chalk.green('\n[OK] Token ajouté!\n'));
                break;

            case 'remove':
                if (config.tokens && config.tokens.length > 0) {
                    const removeAnswers = await inquirer.prompt([
                        {
                            type: 'list',
                            name: 'tokenId',
                            message: 'Token à supprimer:',
                            choices: config.tokens.map(t => ({
                                name: `${t.name} [${t.group}]`,
                                value: t.id
                            }))
                        }
                    ]);

                    await configManager.removeToken(removeAnswers.tokenId);
                    console.log(chalk.green('\n[OK] Token supprimé!\n'));
                } else {
                    console.log(chalk.yellow('\n[!] Aucun token\n'));
                }
                break;

            case 'groups':
                await manageTokenGroups(configManager, groupsConfig);
                break;

            case 'back':
                inTokenMenu = false;
                break;
        }
    }
}

async function manageTokenGroups(configManager, groupsConfig) {
    const groupAnswers = await inquirer.prompt([
        {
            type: 'list',
            name: 'action',
            message: 'Groupes:',
            choices: [
                { name: 'Créer un groupe', value: 'create' },
                { name: 'Supprimer un groupe', value: 'delete' },
                { name: 'Retour', value: 'back' }
            ]
        }
    ]);

    if (groupAnswers.action === 'create') {
        const nameAnswers = await inquirer.prompt([
            {
                type: 'input',
                name: 'groupName',
                message: 'Nom du groupe:',
                validate: (val) => val.length > 0 ? true : 'Entrez un nom'
            }
        ]);

        await configManager.addTokenGroup(nameAnswers.groupName);
        console.log(chalk.green('\n[OK] Groupe créé!\n'));
    } else if (groupAnswers.action === 'delete' && groupsConfig.tokenGroups.length > 0) {
        const deleteAnswers = await inquirer.prompt([
            {
                type: 'list',
                name: 'groupName',
                message: 'Groupe à supprimer:',
                choices: groupsConfig.tokenGroups
            }
        ]);

        await configManager.removeTokenGroup(deleteAnswers.groupName);
        console.log(chalk.green('\n[OK] Groupe supprimé!\n'));
    }
}

async function handleWebhooksCLI(configManager) {
    const webhookConfig = await configManager.read('webhook');

    const answers = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'enabled',
            message: 'Activer les webhooks?',
            default: webhookConfig.enabled
        },
        {
            type: 'input',
            name: 'url',
            message: 'URL du webhook Discord:',
            default: webhookConfig.url,
            when: (ans) => ans.enabled
        },
        {
            type: 'confirm',
            name: 'logErrors',
            message: 'Logger les erreurs?',
            default: webhookConfig.logErrors,
            when: (ans) => ans.enabled
        },
        {
            type: 'confirm',
            name: 'logSuccess',
            message: 'Logger les succès?',
            default: webhookConfig.logSuccess,
            when: (ans) => ans.enabled
        }
    ]);

    const config = {
        enabled: answers.enabled,
        url: answers.url || webhookConfig.url,
        logErrors: answers.logErrors !== undefined ? answers.logErrors : webhookConfig.logErrors,
        logSuccess: answers.logSuccess !== undefined ? answers.logSuccess : webhookConfig.logSuccess
    };

    await configManager.write('webhook', config);
    console.log(chalk.green('\n[OK] Webhooks configurés!\n'));
}
