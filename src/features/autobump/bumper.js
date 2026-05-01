import { Client } from 'discord.js-selfbot-v13';
import { ConfigManager } from '../../config/manager.js';
import { Logger } from '../logging.js';
import { applySelfbotCompatPatch } from '../selfbot-compat.js';

applySelfbotCompatPatch();

const DISBOARD_BOT_ID = '302050872383242240';
const BUMP_INTERVAL_NORMAL = 2 * 60 * 60 * 1000 + 1 * 60 * 1000;
const BUMP_INTERVAL_HUMANIZED_BASE = 2 * 60 * 60 * 1000;
const READY_SETTLE_DELAY = 3000;
const SLASH_RETRY_DELAY = 10000;

export class AutoBumper {
    constructor() {
        this.configManager = new ConfigManager();
        this.logger = new Logger();
        this.activeClients = new Map();
        this.bumpSchedules = new Map();
    }

    async initialize() {
        await this.logger.initialize();
        await this.logger.info('AutoBumper initialisé');
    }

    async startBumping() {
        const config = await this.configManager.read('bump');
        const tokensConfig = await this.configManager.read('tokens');

        if (!config.enabled || !config.servers || config.servers.length === 0) {
            await this.logger.warn('Bump désactivé ou aucun serveur configuré');
            return;
        }

        for (const server of config.servers) {
            if (!server.enabled) continue;

            const token = tokensConfig.tokens.find(t => t.id === server.tokenId);
            if (!token) {
                await this.logger.error('Token non trouvé', { serverId: server.id });
                continue;
            }

            await this.bumpServer(server, token, config.settings);
        }
    }

    async bumpServer(server, tokenObj, settings) {
        const clientKey = `${tokenObj.id}-${server.id}`;

        try {
            let client = this.activeClients.get(clientKey);
            if (!client) {
                client = new Client();
                this.activeClients.set(clientKey, client);

                client.once('ready', () => {
                    this.logger.info(`Client connecté: ${client.user.tag}`, {
                        server: server.id
                    });
                });

                await client.login(tokenObj.token);
            }

            await this.waitForReady(client);

            const channel = await client.channels.fetch(server.bumpChannelId);
            if (!channel) {
                await this.logger.error('Salon bump introuvable', {
                    channelId: server.bumpChannelId
                });
                return;
            }

            if (!channel.isText()) {
                await this.logger.error('Le salon bump n\'est pas textuel', {
                    channelId: server.bumpChannelId
                });
                return;
            }

            this.startBumpLoop(client, server, settings);

        } catch (err) {
            await this.logger.error('Erreur initialisation bump', {
                error: err.message,
                serverId: server.id
            });
        }
    }

    async startBumpLoop(client, server, settings) {
        const clientKey = `${client.user.id}-${server.id}`;

        if (this.bumpSchedules.has(clientKey)) {
            return;
        }

        const scheduleNextBump = () => {
            const delay = this.calculateDelay(settings);
            const timeout = setTimeout(async () => {
                await this.performBump(client, server);
                scheduleNextBump();
            }, delay);

            this.bumpSchedules.set(clientKey, timeout);
        };

        this.bumpSchedules.set(clientKey, null);
        await this.wait(READY_SETTLE_DELAY);
        await this.performBump(client, server);
        scheduleNextBump();
    }

    async performBump(client, server, retry = true) {
        try {
            await this.waitForReady(client);
            const channel = await client.channels.fetch(server.bumpChannelId);
            
            if (!channel.isText()) {
                throw new Error('Salon non textuel');
            }

            await channel.sendSlash(DISBOARD_BOT_ID, 'bump');
            
            await this.logger.success('Bump effectué', {
                server: server.name,
                serverId: server.id
            });

        } catch (err) {
            if (retry && this.shouldRetrySlashCommand(err)) {
                await this.logger.warn('Commande /bump indisponible, nouvelle tentative dans 10 secondes', {
                    serverId: server.id,
                    error: err.message
                });
                await this.wait(SLASH_RETRY_DELAY);
                return this.performBump(client, server, false);
            }

            await this.handleBumpError(err, server, client);
        }
    }

    waitForReady(client) {
        if (client.readyAt && client.user) {
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                cleanup();
                reject(new Error('Client Discord non prêt après 30 secondes'));
            }, 30000);

            const onReady = () => {
                cleanup();
                resolve();
            };

            const onError = (err) => {
                cleanup();
                reject(err);
            };

            const cleanup = () => {
                clearTimeout(timeout);
                client.off('ready', onReady);
                client.off('error', onError);
            };

            client.once('ready', onReady);
            client.once('error', onError);
        });
    }

    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    shouldRetrySlashCommand(err) {
        const message = err.message.toLowerCase();
        return message.includes('application slash command') ||
            message.includes('command bump is not found') ||
            message.includes('invalid_application_command') ||
            message.includes('commandes slash sont indisponibles');
    }

    async handleBumpError(err, server, client) {
        const errorMsg = err.message.toLowerCase();

        if (errorMsg.includes('disabled') || errorMsg.includes('account')) {
            await this.logger.error('Compte désactivé', {
                serverId: server.id,
                error: err.message
            });
            const config = await this.configManager.read('bump');
            const serverConfig = config.servers.find(s => s.id === server.id);
            if (serverConfig) serverConfig.enabled = false;
            await this.configManager.write('bump', config);

        } else if (errorMsg.includes('rate limit') || errorMsg.includes('429')) {
            await this.logger.warn('Rate limited, retry dans 5 min', {
                serverId: server.id
            });
            setTimeout(() => this.performBump(client, server), 5 * 60 * 1000);

        } else if (errorMsg.includes('permission') || errorMsg.includes('not allowed')) {
            await this.logger.error('Permissions insuffisantes', {
                serverId: server.id,
                error: err.message
            });

        } else {
            await this.logger.error('Erreur bump', {
                serverId: server.id,
                error: err.message
            });
        }
    }

    calculateDelay(settings) {
        if (!settings.humanize) {
            return BUMP_INTERVAL_NORMAL;
        }

        const randomMinutes = Math.floor(
            Math.random() * (settings.humanizeMax - settings.humanizeMin + 1) + settings.humanizeMin
        );
        return BUMP_INTERVAL_HUMANIZED_BASE + (randomMinutes * 60 * 1000);
    }

    async validateToken(token, channelId) {
        try {
            const client = new Client();
            await client.login(token);
            
            const channel = await client.channels.fetch(channelId);
            if (!channel?.isText()) {
                await client.destroy();
                return { valid: false, error: 'Salon non textuel' };
            }

            try {
                await client.destroy();
                return { valid: true };
            } catch (err) {
                await client.destroy();
                return { valid: false, error: err.message };
            }

        } catch (err) {
            return { valid: false, error: err.message };
        }
    }

    async stopAll() {
        for (const [key, client] of this.activeClients.entries()) {
            try {
                await client.destroy();
            } catch (err) {
                await this.logger.error('Erreur destruction client', { error: err.message });
            }
        }

        for (const [key, timeout] of this.bumpSchedules.entries()) {
            if (timeout) {
                clearTimeout(timeout);
            }
        }

        this.activeClients.clear();
        this.bumpSchedules.clear();
        await this.logger.info('Tous les bumps arrêtés');
    }
}
