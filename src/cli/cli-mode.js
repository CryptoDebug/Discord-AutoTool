import chalk from 'chalk';
import inquirer from 'inquirer';
import { ConfigManager } from '../config/manager.js';
import { AutoBumper } from '../features/autobump/bumper.js';
import { AutoSender } from '../features/autosender/sender.js';
import { Logger } from '../features/logging.js';

const UI_WIDTH = 64;

const icons = {
    app: '>',
    info: 'i',
    ok: 'OK',
    stop: 'STOP',
    warning: '!',
    error: 'X'
};

function line(char = '-') {
    return chalk.gray(char.repeat(UI_WIDTH));
}

function title(text, subtitle) {
    console.log('');
    console.log(line('='));
    console.log(chalk.bold.cyan(` ${icons.app} ${text}`));
    if (subtitle) {
        console.log(chalk.gray(`   ${subtitle}`));
    }
    console.log(line('='));
}

function section(text, subtitle) {
    console.log('');
    console.log(chalk.bold.cyan(text));
    if (subtitle) {
        console.log(chalk.gray(subtitle));
    }
    console.log(line());
}

function emptyState(text, hint) {
    console.log('');
    console.log(chalk.yellow(`[${icons.warning}] ${text}`));
    if (hint) {
        console.log(chalk.gray(`    ${hint}`));
    }
    console.log('');
}

function success(text) {
    console.log(chalk.green(`\n[${icons.ok}] ${text}\n`));
}

function danger(text) {
    console.log(chalk.red(`\n[${icons.error}] ${text}\n`));
}

function stopped(text) {
    console.log(chalk.red(`\n[${icons.stop}] ${text}\n`));
}

function statusLabel(enabled) {
    return enabled ? chalk.green('actif') : chalk.gray('inactif');
}

function safeText(value, fallback = 'Sans nom') {
    if (typeof value !== 'string') {
        return value || fallback;
    }

    return value.trim() || fallback;
}

function maskedToken(token) {
    if (!token) {
        return chalk.gray('token indisponible');
    }

    return `${token.substring(0, 15)}${chalk.gray('...')}`;
}

function menuChoice(label, hint, value) {
    return {
        name: hint ? `${label} ${chalk.gray(`- ${hint}`)}` : label,
        value
    };
}

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
        title('Discord AutoTool', 'Choisissez un espace de configuration ou lancez un module.');
        const answers = await inquirer.prompt([
            {
                type: 'list',
                name: 'mode',
                message: 'Menu principal',
                choices: [
                    menuChoice('AutoBump', 'serveurs et bump automatique', 'bump'),
                    menuChoice('AutoSender', 'envoi automatique de messages', 'sender'),
                    menuChoice('Tokens', 'ajouter, supprimer et grouper', 'tokens'),
                    menuChoice('Webhooks', 'journalisation Discord', 'webhooks'),
                    new inquirer.Separator(line()),
                    menuChoice('Quitter', 'fermer la CLI', 'quit')
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
        const serverCount = config.servers?.length || 0;

        section('AutoBump', `${serverCount} serveur(s) configuré(s). Statut: ${config.enabled ? 'actif' : 'inactif'}.`);
        const answers = await inquirer.prompt([
            {
                type: 'list',
                name: 'action',
                message: 'Que voulez-vous faire ?',
                choices: [
                    menuChoice(`Voir les serveurs (${serverCount})`, 'consulter la liste actuelle', 'list'),
                    menuChoice('Ajouter un serveur', 'ID serveur, salon bump et token', 'add'),
                    menuChoice('Supprimer un serveur', 'retirer une entrée existante', 'remove'),
                    menuChoice('Paramètres', 'humanisation et limite par token', 'settings'),
                    new inquirer.Separator(line()),
                    menuChoice('Démarrer', 'activer AutoBump', 'start'),
                    menuChoice('Arrêter', 'désactiver AutoBump', 'stop'),
                    new inquirer.Separator(line()),
                    menuChoice('Retour', 'menu principal', 'back')
                ]
            }
        ]);

        switch (answers.action) {
            case 'list':
                if (config.servers && config.servers.length > 0) {
                    section('Serveurs configurés');
                    config.servers.forEach((s, i) => {
                        console.log(` ${chalk.gray(String(i + 1).padStart(2, '0'))}. ${chalk.bold(safeText(s.name))}`);
                        console.log(`     ID serveur : ${chalk.white(s.serverId)}`);
                        console.log(`     Statut     : ${statusLabel(s.enabled)}`);
                    });
                    console.log('');
                } else {
                    emptyState('Aucun serveur configuré.', 'Ajoutez un serveur pour utiliser AutoBump.');
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
                success('AutoBump démarré.');
                break;

            case 'stop':
                config.enabled = false;
                await configManager.write('bump', config);
                await autoBumper.stopAll();
                stopped('AutoBump arrêté.');
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
        danger('Aucun token configuré. Ajoutez un token avant de créer un serveur AutoBump.');
        return;
    }

    section('Nouveau serveur AutoBump', 'Renseignez les identifiants Discord nécessaires.');
    const answers = await inquirer.prompt([
        {
            type: 'input',
            name: 'serverId',
            message: 'ID du serveur',
            validate: (val) => val.length > 0 ? true : 'Entrez un ID'
        },
        {
            type: 'input',
            name: 'bumpChannelId',
            message: 'ID du salon bump',
            validate: (val) => val.length > 0 ? true : 'Entrez un ID'
        },
        {
            type: 'list',
            name: 'tokenId',
            message: 'Token à utiliser',
            choices: tokensConfig.tokens.map(t => ({
                name: `${safeText(t.name, 'Token sans nom')} ${chalk.gray(`[${t.group}]`)}`,
                value: t.id
            }))
        },
        {
            type: 'input',
            name: 'name',
            message: 'Nom du serveur (optionnel)'
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
    success('Serveur ajouté.');
}

async function removeBumpServer(configManager) {
    const config = await configManager.read('bump');

    if (!config.servers || config.servers.length === 0) {
        emptyState('Aucun serveur à supprimer.');
        return;
    }

    section('Supprimer un serveur AutoBump');
    const answers = await inquirer.prompt([
        {
            type: 'list',
            name: 'serverId',
            message: 'Serveur à supprimer',
            choices: config.servers.map(s => ({
                name: `${safeText(s.name)} ${chalk.gray(`(${s.serverId})`)}`,
                value: s.id
            }))
        }
    ]);

    config.servers = config.servers.filter(s => s.id !== answers.serverId);
    await configManager.write('bump', config);
    success('Serveur supprimé.');
}

async function configureBumpSettings(configManager) {
    const config = await configManager.read('bump');

    section('Paramètres AutoBump', 'Ajustez uniquement le comportement déjà existant.');
    const answers = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'humanize',
            message: 'Activer l\'humanisation (délai aléatoire)',
            default: config.settings.humanize
        },
        {
            type: 'number',
            name: 'humanizeMin',
            message: 'Délai minimum (minutes)',
            default: config.settings.humanizeMin,
            when: (ans) => ans.humanize
        },
        {
            type: 'number',
            name: 'humanizeMax',
            message: 'Délai maximum (minutes)',
            default: config.settings.humanizeMax,
            when: (ans) => ans.humanize
        },
        {
            type: 'number',
            name: 'maxServersPerToken',
            message: 'Nombre maximum de serveurs par token',
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
    success('Paramètres enregistrés.');
}

async function handleSenderCLI(configManager, autoSender, logger) {
    section('AutoSender');
    console.log(chalk.gray(`[${icons.info}] Mode CLI en développement...`));
    console.log('');
}

async function handleTokensCLI(configManager) {
    let inTokenMenu = true;

    while (inTokenMenu) {
        const config = await configManager.read('tokens');
        const groupsConfig = await configManager.read('groups');
        const tokenCount = config.tokens?.length || 0;
        const groupCount = groupsConfig.tokenGroups?.length || 0;

        section('Tokens', `${tokenCount} token(s), ${groupCount} groupe(s).`);
        const answers = await inquirer.prompt([
            {
                type: 'list',
                name: 'action',
                message: 'Que voulez-vous faire ?',
                choices: [
                    menuChoice(`Voir les tokens (${tokenCount})`, 'liste masquée pour rester lisible', 'list'),
                    menuChoice('Ajouter un token', 'nom, valeur et groupe', 'add'),
                    menuChoice('Supprimer un token', 'retirer une entrée', 'remove'),
                    menuChoice('Gérer les groupes', 'créer ou supprimer un groupe', 'groups'),
                    new inquirer.Separator(line()),
                    menuChoice('Retour', 'menu principal', 'back')
                ]
            }
        ]);

        switch (answers.action) {
            case 'list':
                if (config.tokens && config.tokens.length > 0) {
                    section('Tokens enregistrés');
                    config.tokens.forEach((t, i) => {
                        console.log(` ${chalk.gray(String(i + 1).padStart(2, '0'))}. ${chalk.bold(safeText(t.name, 'Token sans nom'))}`);
                        console.log(`     Groupe : ${chalk.white(t.group)}`);
                        console.log(`     Token  : ${maskedToken(t.token)}`);
                    });
                    console.log('');
                } else {
                    emptyState('Aucun token enregistré.', 'Ajoutez un token pour configurer AutoBump ou AutoSender.');
                }
                break;

            case 'add':
                section('Ajouter un token');
                const tokenAnswers = await inquirer.prompt([
                    {
                        type: 'password',
                        name: 'token',
                        message: 'Token Discord',
                        validate: (val) => val.length > 20 ? true : 'Token invalide'
                    },
                    {
                        type: 'input',
                        name: 'name',
                        message: 'Nom (optionnel)'
                    },
                    {
                        type: 'list',
                        name: 'group',
                        message: 'Groupe',
                        choices: [...(groupsConfig.tokenGroups || []), 'default']
                    }
                ]);

                await configManager.addToken(tokenAnswers.token, tokenAnswers.name, tokenAnswers.group);
                success('Token ajouté.');
                break;

            case 'remove':
                if (config.tokens && config.tokens.length > 0) {
                    section('Supprimer un token');
                    const removeAnswers = await inquirer.prompt([
                        {
                            type: 'list',
                            name: 'tokenId',
                            message: 'Token à supprimer',
                            choices: config.tokens.map(t => ({
                                name: `${safeText(t.name, 'Token sans nom')} ${chalk.gray(`[${t.group}]`)}`,
                                value: t.id
                            }))
                        }
                    ]);

                    await configManager.removeToken(removeAnswers.tokenId);
                    success('Token supprimé.');
                } else {
                    emptyState('Aucun token à supprimer.');
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
    section('Groupes de tokens', `${groupsConfig.tokenGroups?.length || 0} groupe(s) personnalisé(s).`);
    const groupAnswers = await inquirer.prompt([
        {
            type: 'list',
            name: 'action',
            message: 'Que voulez-vous faire ?',
            choices: [
                menuChoice('Créer un groupe', 'organiser les tokens', 'create'),
                menuChoice('Supprimer un groupe', 'retirer un groupe existant', 'delete'),
                new inquirer.Separator(line()),
                menuChoice('Retour', 'menu tokens', 'back')
            ]
        }
    ]);

    if (groupAnswers.action === 'create') {
        section('Créer un groupe');
        const nameAnswers = await inquirer.prompt([
            {
                type: 'input',
                name: 'groupName',
                message: 'Nom du groupe',
                validate: (val) => val.length > 0 ? true : 'Entrez un nom'
            }
        ]);

        await configManager.addTokenGroup(nameAnswers.groupName);
        success('Groupe créé.');
    } else if (groupAnswers.action === 'delete' && groupsConfig.tokenGroups.length > 0) {
        section('Supprimer un groupe');
        const deleteAnswers = await inquirer.prompt([
            {
                type: 'list',
                name: 'groupName',
                message: 'Groupe à supprimer',
                choices: groupsConfig.tokenGroups
            }
        ]);

        await configManager.removeTokenGroup(deleteAnswers.groupName);
        success('Groupe supprimé.');
    } else if (groupAnswers.action === 'delete') {
        emptyState('Aucun groupe personnalisé à supprimer.');
    }
}

async function handleWebhooksCLI(configManager) {
    const webhookConfig = await configManager.read('webhook');

    section('Webhooks', `Statut actuel: ${webhookConfig.enabled ? 'actif' : 'inactif'}.`);
    const answers = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'enabled',
            message: 'Activer les webhooks',
            default: webhookConfig.enabled
        },
        {
            type: 'input',
            name: 'url',
            message: 'URL du webhook Discord',
            default: webhookConfig.url,
            when: (ans) => ans.enabled
        },
        {
            type: 'confirm',
            name: 'logErrors',
            message: 'Journaliser les erreurs',
            default: webhookConfig.logErrors,
            when: (ans) => ans.enabled
        },
        {
            type: 'confirm',
            name: 'logSuccess',
            message: 'Journaliser les succès',
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
    success('Webhooks configurés.');
}
