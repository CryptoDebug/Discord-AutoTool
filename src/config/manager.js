import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = path.join(__dirname, '../../config');

export class ConfigManager {
    constructor() {
        this.configDir = CONFIG_DIR;
        this.files = {
            tokens: path.join(CONFIG_DIR, 'tokens.json'),
            bump: path.join(CONFIG_DIR, 'bump-config.json'),
            sender: path.join(CONFIG_DIR, 'sender-config.json'),
            groups: path.join(CONFIG_DIR, 'groups.json'),
            webhook: path.join(CONFIG_DIR, 'webhooks.json')
        };
    }

    async initialize() {
        try {
            await fs.mkdir(this.configDir, { recursive: true });
            
            await this.ensureFile(this.files.tokens, {
                tokens: []
            });

            await this.ensureFile(this.files.bump, {
                enabled: false,
                settings: {
                    humanize: true,
                    humanizeMin: 1,
                    humanizeMax: 15,
                    maxServersPerToken: 4
                },
                servers: []
            });

            await this.ensureFile(this.files.sender, {
                enabled: false,
                globalChannels: [],
                messages: [],
                settings: {
                    delayBetweenMessages: 3.5
                }
            });

            await this.ensureFile(this.files.groups, {
                tokenGroups: [],
                channelGroups: []
            });

            await this.ensureFile(this.files.webhook, {
                enabled: false,
                url: '',
                logErrors: true,
                logSuccess: false
            });
        } catch (err) {
            console.error('Erreur initialisation config:', err);
            throw err;
        }
    }

    async ensureFile(filePath, defaultContent) {
        try {
            await fs.access(filePath);
        } catch {
            await fs.writeFile(filePath, JSON.stringify(defaultContent, null, 2));
        }
    }

    async read(key) {
        try {
            const data = await fs.readFile(this.files[key], 'utf-8');
            return JSON.parse(data);
        } catch (err) {
            console.error(`Erreur lecture config ${key}:`, err);
            return null;
        }
    }

    async write(key, data) {
        try {
            await fs.writeFile(this.files[key], JSON.stringify(data, null, 2));
            return true;
        } catch (err) {
            console.error(`Erreur écriture config ${key}:`, err);
            return false;
        }
    }

    async addToken(token, name = '', group = 'default') {
        const config = await this.read('tokens');
        config.tokens.push({
            id: Date.now().toString(),
            token,
            name: name || `Token-${Date.now()}`,
            group,
            createdAt: new Date().toISOString()
        });
        return await this.write('tokens', config);
    }

    async updateToken(tokenId, updates = {}) {
        const config = await this.read('tokens');
        const tokenIndex = config.tokens.findIndex(t => t.id === tokenId);

        if (tokenIndex === -1) {
            return false;
        }

        const currentToken = config.tokens[tokenIndex];
        config.tokens[tokenIndex] = {
            ...currentToken,
            token: updates.token !== undefined ? updates.token : currentToken.token,
            name: updates.name !== undefined ? (updates.name || currentToken.name) : currentToken.name,
            group: updates.group !== undefined ? (updates.group || 'default') : currentToken.group,
            updatedAt: new Date().toISOString()
        };

        return await this.write('tokens', config);
    }

    async removeToken(tokenId) {
        const config = await this.read('tokens');
        const initialLength = config.tokens.length;
        config.tokens = config.tokens.filter(t => t.id !== tokenId);

        if (config.tokens.length === initialLength) {
            return false;
        }

        return await this.write('tokens', config);
    }

    async reorderTokens(tokenIds = []) {
        const config = await this.read('tokens');
        const tokenById = new Map(config.tokens.map(token => [token.id, token]));
        const uniqueIds = new Set(tokenIds);

        if (uniqueIds.size !== config.tokens.length || tokenIds.some(tokenId => !tokenById.has(tokenId))) {
            return false;
        }

        config.tokens = tokenIds.map(tokenId => tokenById.get(tokenId));
        return await this.write('tokens', config);
    }

    async getTokensByGroup(groupName) {
        const config = await this.read('tokens');
        return config.tokens.filter(t => t.group === groupName);
    }

    normalizeDelaySeconds(value, fallback = 3.5) {
        const delay = Number(value);

        if (!Number.isFinite(delay) || delay <= 0) {
            return fallback;
        }

        return delay >= 1000 ? delay / 1000 : delay;
    }

    async normalizeSenderConfig() {
        const config = await this.read('sender');

        if (!config) {
            return null;
        }

        let changed = false;

        config.settings = config.settings || {};
        const normalizedDelay = this.normalizeDelaySeconds(config.settings.delayBetweenMessages);
        if (config.settings.delayBetweenMessages !== normalizedDelay) {
            config.settings.delayBetweenMessages = normalizedDelay;
            changed = true;
        }

        config.globalChannels = (config.globalChannels || []).map(channel => {
            if (typeof channel === 'string') {
                changed = true;
                return {
                    id: channel,
                    channelId: channel,
                    name: `Salon-${channel}`,
                    group: 'default',
                    createdAt: new Date().toISOString()
                };
            }

            return {
                id: channel.id || channel.channelId || Date.now().toString(),
                channelId: channel.channelId || channel.id,
                name: channel.name || `Salon-${channel.channelId || channel.id}`,
                group: channel.group || 'default',
                createdAt: channel.createdAt || new Date().toISOString(),
                ...channel
            };
        });

        config.messages = (config.messages || []).map(message => {
            const customDelay = message.customDelay === null || message.customDelay === undefined
                ? null
                : this.normalizeDelaySeconds(message.customDelay);

            if (message.customDelay !== customDelay) {
                changed = true;
            }

            return {
                ...message,
                customDelay
            };
        });

        if (changed) {
            await this.write('sender', config);
        }

        return config;
    }

    async addTokenGroup(groupName) {
        const config = await this.read('groups');
        if (!config.tokenGroups.includes(groupName)) {
            config.tokenGroups.push(groupName);
            await this.write('groups', config);
        }
        return true;
    }

    async removeTokenGroup(groupName) {
        const config = await this.read('groups');
        config.tokenGroups = config.tokenGroups.filter(g => g !== groupName);
        const tokens = await this.read('tokens');
        tokens.tokens = tokens.tokens.filter(t => t.group !== groupName);
        await this.write('tokens', tokens);
        await this.write('groups', config);
        return true;
    }

    async addChannel(channelId, name = '', group = 'default') {
        const config = await this.normalizeSenderConfig();
        const cleanedChannelId = channelId.trim();

        if (config.globalChannels.some(channel => channel.channelId === cleanedChannelId)) {
            throw new Error('Salon déjà existant');
        }

        config.globalChannels.push({
            id: Date.now().toString(),
            channelId: cleanedChannelId,
            name: name || `Salon-${cleanedChannelId}`,
            group,
            createdAt: new Date().toISOString()
        });

        return await this.write('sender', config);
    }

    async updateChannel(channelConfigId, updates = {}) {
        const config = await this.normalizeSenderConfig();
        const channelIndex = config.globalChannels.findIndex(channel => channel.id === channelConfigId);

        if (channelIndex === -1) {
            return false;
        }

        const channelId = updates.channelId?.trim();
        if (!channelId) {
            throw new Error('ID de salon vide');
        }

        const duplicate = config.globalChannels.some(channel =>
            channel.id !== channelConfigId && channel.channelId === channelId
        );

        if (duplicate) {
            throw new Error('Salon déjà existant');
        }

        const currentChannel = config.globalChannels[channelIndex];
        config.globalChannels[channelIndex] = {
            ...currentChannel,
            channelId,
            name: updates.name !== undefined ? (updates.name || currentChannel.name) : currentChannel.name,
            group: updates.group !== undefined ? (updates.group || 'default') : currentChannel.group,
            updatedAt: new Date().toISOString()
        };

        return await this.write('sender', config);
    }

    async removeChannel(channelConfigId) {
        const config = await this.normalizeSenderConfig();
        const initialLength = config.globalChannels.length;
        config.globalChannels = config.globalChannels.filter(channel => channel.id !== channelConfigId);

        if (config.globalChannels.length === initialLength) {
            return false;
        }

        return await this.write('sender', config);
    }

    async reorderChannels(channelConfigIds = []) {
        const config = await this.normalizeSenderConfig();
        const channelById = new Map(config.globalChannels.map(channel => [channel.id, channel]));
        const uniqueIds = new Set(channelConfigIds);

        if (
            uniqueIds.size !== config.globalChannels.length ||
            channelConfigIds.some(channelConfigId => !channelById.has(channelConfigId))
        ) {
            return false;
        }

        config.globalChannels = channelConfigIds.map(channelConfigId => channelById.get(channelConfigId));
        return await this.write('sender', config);
    }

    async addChannelGroup(groupName) {
        const config = await this.read('groups');
        const cleanedGroupName = groupName?.trim();

        if (!cleanedGroupName) {
            throw new Error('Nom de groupe vide');
        }

        config.channelGroups = config.channelGroups || [];

        if (!config.channelGroups.includes(cleanedGroupName)) {
            config.channelGroups.push(cleanedGroupName);
            await this.write('groups', config);
        }

        return true;
    }

    async removeChannelGroup(groupName) {
        const cleanedGroupName = groupName?.trim();
        const groups = await this.read('groups');
        groups.channelGroups = (groups.channelGroups || []).filter(group => group !== cleanedGroupName);

        const sender = await this.normalizeSenderConfig();
        sender.globalChannels = sender.globalChannels.filter(channel => channel.group !== cleanedGroupName);

        await this.write('sender', sender);
        await this.write('groups', groups);
        return true;
    }
}
