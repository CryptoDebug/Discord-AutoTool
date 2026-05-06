import { Client } from 'discord.js-selfbot-v13';
import { ConfigManager } from '../../config/manager.js';
import { Permissions } from 'discord.js-selfbot-v13';
import { Logger } from '../logging.js';
import { applySelfbotCompatPatch } from '../selfbot-compat.js';

applySelfbotCompatPatch();

const DISBOARD_BOT_ID = '302050872383242240';
const SAME_SERVER_INTERVAL = 2 * 60 * 60 * 1000 + 4 * 60 * 1000;
const DIFFERENT_SERVER_INTERVAL = 31 * 60 * 1000;
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

        const serversByToken = new Map();

        for (const server of config.servers) {
            const token = tokensConfig.tokens.find(t => t.id === server.tokenId);
            if (!token) {
                await this.logger.error('Token non trouvé', { serverId: server.id });
                continue;
            }

            if (!serversByToken.has(token.id)) {
                serversByToken.set(token.id, { token, servers: [] });
            }

            serversByToken.get(token.id).servers.push(server);
        }

        for (const { token, servers } of serversByToken.values()) {
            await this.startTokenBumpLoop(token, servers, config.settings);
        }
    }

    async startTokenBumpLoop(tokenObj, servers, settings) {
        const clientKey = tokenObj.id;

        try {
            let client = this.activeClients.get(clientKey);
            if (!client) {
                client = new Client();
                this.activeClients.set(clientKey, client);

                client.once('ready', () => {
                    this.logger.info(`Client connecté: ${client.user.tag}`, {
                        tokenId: tokenObj.id
                    });
                });

                await client.login(tokenObj.token);
            }

            await this.waitForReady(client);

            const validServers = [];

            for (const server of servers) {
                const channel = await client.channels.fetch(server.bumpChannelId);
                if (!channel) {
                    await this.logger.error('Salon bump introuvable', {
                        channelId: server.bumpChannelId,
                        serverId: server.id
                    });
                    continue;
                }

                if (!channel.isText()) {
                    await this.logger.error('Le salon bump n\'est pas textuel', {
                        channelId: server.bumpChannelId,
                        serverId: server.id
                    });
                    continue;
                }

                validServers.push(server);
            }

            if (validServers.length === 0) {
                await this.logger.warn('Aucun serveur valide pour ce token', {
                    tokenId: tokenObj.id
                });
                return;
            }

            await this.startBumpLoop(client, tokenObj.id, validServers, settings);

        } catch (err) {
            await this.logger.error('Erreur initialisation bump', {
                error: err.message,
                tokenId: tokenObj.id
            });
        }
    }

    async startBumpLoop(client, tokenId, servers, settings) {
        const scheduleKey = tokenId;

        if (this.bumpSchedules.has(scheduleKey)) {
            return;
        }

        let currentIndex = 0;

        const getEnabledServers = async () => {
            const latestConfig = await this.configManager.read('bump');
            const enabledServerIds = new Set(
                (latestConfig.servers || [])
                    .filter(server => server.enabled && server.tokenId === tokenId)
                    .map(server => server.id)
            );

            return servers.filter(server => enabledServerIds.has(server.id));
        };

        const scheduleNextBump = async () => {
            const enabledServers = await getEnabledServers();
            if (enabledServers.length === 0) {
                const timeout = setTimeout(scheduleNextBump, DIFFERENT_SERVER_INTERVAL);
                this.bumpSchedules.set(scheduleKey, timeout);
                return;
            }

            currentIndex = currentIndex % enabledServers.length;
            const delay = this.calculateDelay(settings, enabledServers.length, currentIndex);
            const timeout = setTimeout(async () => {
                const latestEnabledServers = await getEnabledServers();

                if (latestEnabledServers.length > 0) {
                    currentIndex = currentIndex % latestEnabledServers.length;
                    const server = latestEnabledServers[currentIndex];
                    currentIndex = (currentIndex + 1) % latestEnabledServers.length;
                    await this.performBump(client, server);
                }

                await scheduleNextBump();
            }, delay);

            this.bumpSchedules.set(scheduleKey, timeout);
        };

        this.bumpSchedules.set(scheduleKey, null);
        await this.wait(READY_SETTLE_DELAY);
        const enabledServers = await getEnabledServers();
        if (enabledServers.length > 0) {
            await this.performBump(client, enabledServers[currentIndex]);
            currentIndex = (currentIndex + 1) % enabledServers.length;
        }
        await scheduleNextBump();
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
            await this.logger.warn('Rate limited, prochain bump selon le planning', {
                serverId: server.id
            });

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

    calculateDelay(settings, serverCount = 1, nextIndex = 0) {
        const maxServersPerToken = settings?.maxServersPerToken || 4;
        let delay;

        if (serverCount > maxServersPerToken) {
            delay = DIFFERENT_SERVER_INTERVAL;
        } else if (serverCount <= 1) {
            delay = SAME_SERVER_INTERVAL;
        } else if (nextIndex === 0) {
            const timeAlreadySpentInRound = DIFFERENT_SERVER_INTERVAL * (serverCount - 1);
            delay = Math.max(
                DIFFERENT_SERVER_INTERVAL,
                SAME_SERVER_INTERVAL - timeAlreadySpentInRound
            );
        } else {
            delay = DIFFERENT_SERVER_INTERVAL;
        }

        return delay + this.calculateHumanizeDelay(settings);
    }

    calculateHumanizeDelay(settings) {
        if (!settings?.humanize) {
            return 0;
        }

        const min = Number.isFinite(settings.humanizeMin) ? settings.humanizeMin : 1;
        const max = Number.isFinite(settings.humanizeMax) ? settings.humanizeMax : min;
        const minMinutes = Math.max(0, Math.min(min, max));
        const maxMinutes = Math.max(minMinutes, max);
        const randomMinutes = Math.floor(
            Math.random() * (maxMinutes - minMinutes + 1) + minMinutes
        );

        return randomMinutes * 60 * 1000;
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

    async validateBumpTarget(token, serverId, channelId) {
        const client = new Client();

        try {
            await client.login(token);
            await this.waitForReady(client);

            const guild = await client.guilds.fetch(serverId).catch(() => null);
            if (!guild) {
                return {
                    valid: false,
                    error: "Serveur introuvable avec ce token. Vérifiez l'ID serveur ou le token sélectionné."
                };
            }

            const channel = await client.channels.fetch(channelId).catch(() => null);
            if (!channel) {
                return {
                    valid: false,
                    error: "Salon bump introuvable. Vérifiez l'ID du salon."
                };
            }

            if (!channel.guild || channel.guild.id !== guild.id) {
                return {
                    valid: false,
                    error: "Ce salon n'appartient pas au serveur indiqué."
                };
            }

            if (!channel.isText()) {
                return {
                    valid: false,
                    error: 'Le salon bump doit être un salon textuel.'
                };
            }

            const permissions = channel.permissionsFor(client.user);
            if (!permissions?.has(Permissions.FLAGS.VIEW_CHANNEL, false)) {
                return {
                    valid: false,
                    error: 'Le salon bump est inaccessible avec ce token.'
                };
            }

            if (!permissions?.has(Permissions.FLAGS.SEND_MESSAGES, false)) {
                return {
                    valid: false,
                    error: 'Le salon bump est en lecture seule pour ce token.'
                };
            }

            return {
                valid: true,
                serverName: guild.name,
                channelName: channel.name
            };
        } catch (err) {
            return {
                valid: false,
                error: err.message
            };
        } finally {
            try {
                await client.destroy();
            } catch {
                // Ignore cleanup errors after validation.
            }
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
