import { Client } from 'discord.js-selfbot-v13';
import { Permissions } from 'discord.js-selfbot-v13';
import { ConfigManager } from '../../config/manager.js';
import { Logger } from '../logging.js';
import { applySelfbotCompatPatch } from '../selfbot-compat.js';

applySelfbotCompatPatch();

export class AutoSender {
    constructor() {
        this.configManager = new ConfigManager();
        this.logger = new Logger();
        this.activeClients = new Map();
        this.sendSchedules = new Map();
    }

    async initialize() {
        await this.logger.initialize();
        await this.logger.info('AutoSender initialisé');
    }

    async startSending() {
        const config = await this.configManager.normalizeSenderConfig();
        const tokensConfig = await this.configManager.read('tokens');

        if (!config.enabled || !config.messages || config.messages.length === 0) {
            await this.logger.warn('Sender désactivé ou aucun message configuré');
            return;
        }

        for (const message of config.messages) {
            if (!message.enabled) continue;

            let tokensToUse = [];
            if (message.useGlobalTokens) {
                tokensToUse = tokensConfig.tokens;
            } else if (message.tokenGroupId) {
                tokensToUse = await this.configManager.getTokensByGroup(message.tokenGroupId);
            } else {
                tokensToUse = tokensConfig.tokens.filter(t => 
                    message.specificTokenIds.includes(t.id)
                );
            }

            let channelsToUse = [];
            if (message.useGlobalChannels) {
                channelsToUse = this.resolveChannelIds(config.globalChannels);
            } else if (message.channelGroupId) {
                channelsToUse = this.getChannelsByGroup(config, message.channelGroupId);
            } else {
                channelsToUse = message.specificChannelIds;
            }

            for (const token of tokensToUse) {
                await this.startSendingForToken(message, token, channelsToUse, config.settings);
            }
        }
    }

    getChannelsByGroup(config, groupId) {
        const channels = (config.globalChannels || [])
            .filter(channel => channel.group === groupId);

        if (channels.length > 0) {
            return this.resolveChannelIds(channels);
        }

        const legacyGroup = config.channelGroups?.find(group => group.id === groupId || group.name === groupId);
        return this.resolveChannelIds(legacyGroup?.channels || []);
    }

    resolveChannelIds(channels = []) {
        return channels
            .map(channel => typeof channel === 'string' ? channel : channel.channelId || channel.id)
            .filter(Boolean);
    }

    async startSendingForToken(message, token, channels, settings) {
        const clientKey = `${token.id}-msg-${message.id}`;

        try {
            let client = this.activeClients.get(clientKey);
            if (!client) {
                client = new Client();
                this.activeClients.set(clientKey, client);

                client.once('ready', () => {
                    this.logger.info(`Sender client connecté: ${client.user.tag}`);
                });

                await client.login(token.token);
            }

            this.startSendLoop(client, message, channels, settings);

        } catch (err) {
            await this.logger.error('Erreur initialisation sender', {
                error: err.message,
                messageId: message.id
            });
        }
    }

    async startSendLoop(client, message, channels, settings) {
        await this.sendToChannels(client, message, channels);

        const interval = setInterval(async () => {
            const delay = this.calculateDelay(message, settings);
            await new Promise(res => setTimeout(res, delay));
            await this.sendToChannels(client, message, channels);
        }, this.calculateDelay(message, settings));

        const clientKey = `${client.user.id}-msg-${message.id}`;
        this.sendSchedules.set(clientKey, interval);
    }

    async sendToChannels(client, message, channels) {
        const batchSize = 3;

        for (let i = 0; i < channels.length; i += batchSize) {
            const batch = channels.slice(i, i + batchSize);

            for (const channelId of batch) {
                await this.sendMessage(client, message, channelId);
                
                const delay = this.calculateDelay(message, {
                    delayBetweenMessages: 3.5
                });
                await new Promise(res => setTimeout(res, delay));
            }

            await new Promise(res => setTimeout(res, 2000));
        }
    }

    async sendMessage(client, message, channelId) {
        try {
            const channel = await client.channels.fetch(channelId);
            
            if (!channel?.isText()) {
                await this.logger.warn('Salon non textuel', { channelId });
                return;
            }

            const msgContent = this.replacePlaceholders(message.content);
            await channel.send(msgContent);

            await this.logger.success('Message envoyé', {
                channelId,
                guildName: channel.guild?.name
            });

        } catch (err) {
            await this.handleSendError(err, channelId, message.id);
        }
    }

    async handleSendError(err, channelId, messageId) {
        const errorMsg = err.message.toLowerCase();

        if (errorMsg.includes('unknown channel') || errorMsg.includes('404')) {
            await this.logger.error('Salon supprimé/introuvable', {
                channelId,
                error: err.message
            });

        } else if (errorMsg.includes('missing permissions') || errorMsg.includes('forbidden')) {
            await this.logger.error('Permissions insuffisantes', {
                channelId,
                error: err.message
            });

        } else if (errorMsg.includes('slowmode')) {
            await this.logger.warn('Slowmode détecté', { channelId });

        } else if (errorMsg.includes('muted') || errorMsg.includes('mute')) {
            await this.logger.error('Compte mute dans ce serveur', {
                channelId,
                error: err.message
            });

        } else if (errorMsg.includes('disabled') || errorMsg.includes('account')) {
            await this.logger.error('Compte désactivé', {
                channelId,
                error: err.message
            });

        } else {
            await this.logger.error('Erreur envoi message', {
                channelId,
                error: err.message
            });
        }
    }

    async validateChannelTarget(token, channelId) {
        const client = new Client();

        try {
            await client.login(token);
            await this.waitForReady(client);
            const channel = await client.channels.fetch(channelId).catch(() => null);

            if (!channel) {
                return {
                    valid: false,
                    error: "Salon introuvable avec ce token. Vérifiez l'ID du salon ou le token sélectionné."
                };
            }

            if (!channel.isText()) {
                return {
                    valid: false,
                    error: 'Le salon doit être un salon textuel.'
                };
            }

            const permissions = channel.permissionsFor(client.user);
            if (!permissions?.has(Permissions.FLAGS.VIEW_CHANNEL, false)) {
                return {
                    valid: false,
                    error: 'Le salon est inaccessible avec ce token.'
                };
            }

            if (!permissions?.has(Permissions.FLAGS.SEND_MESSAGES, false)) {
                return {
                    valid: false,
                    error: 'Le salon est en lecture seule pour ce token.'
                };
            }

            return {
                valid: true,
                channelName: channel.name,
                guildName: channel.guild?.name || 'DM'
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

    async waitForReady(client) {
        if (client.readyAt) {
            return;
        }

        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Connexion du token trop lente')), 15000);
            client.once('ready', () => {
                clearTimeout(timeout);
                resolve();
            });
        });
    }

    calculateDelay(message, settings) {
        const delayInSeconds = Number(message.customDelay || settings.delayBetweenMessages || 3.5);
        const normalizedSeconds = Number.isFinite(delayInSeconds) && delayInSeconds > 0 ? delayInSeconds : 3.5;

        return normalizedSeconds * 1000;
    }

    calculateDelaySeconds(message, settings) {
        if (message.customDelay) {
            return message.customDelay;
        }

        return settings.delayBetweenMessages || 3.5;
    }

    replacePlaceholders(content) {
        const now = new Date();
        return content
            .replace('{date}', now.toLocaleDateString('fr-FR'))
            .replace('{time}', now.toLocaleTimeString('fr-FR'))
            .replace('{timestamp}', now.toISOString())
            .replace('{random}', Math.random().toString(36).substring(2, 8));
    }

    async stopAll() {
        for (const [key, client] of this.activeClients.entries()) {
            try {
                await client.destroy();
            } catch (err) {
                await this.logger.error('Erreur destruction client', { error: err.message });
            }
        }

        for (const [key, interval] of this.sendSchedules.entries()) {
            clearInterval(interval);
        }

        this.activeClients.clear();
        this.sendSchedules.clear();
        await this.logger.info('Tous les envois arrêtés');
    }
}
