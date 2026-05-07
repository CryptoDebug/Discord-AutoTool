import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { Client } from 'discord.js-selfbot-v13';
import { ConfigManager } from '../config/manager.js';
import { AutoBumper } from '../features/autobump/bumper.js';
import { AutoSender } from '../features/autosender/sender.js';
import { Logger } from '../features/logging.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3000;

function openBrowser(url) {
    const command = process.platform === 'win32'
        ? `start "" "${url}"`
        : process.platform === 'darwin'
            ? `open "${url}"`
            : `xdg-open "${url}"`;

    exec(command, (err) => {
        if (err) {
            console.log(`Ouvrez votre navigateur sur: ${url}`);
        }
    });
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const configManager = new ConfigManager();
const autoBumper = new AutoBumper();
const autoSender = new AutoSender();
const logger = new Logger();

let isRunning = false;
const DISCORD_HCAPTCHA_SITEKEY = 'f5561ba9-8f1e-40ca-9b5b-a0b3f719ef34';

function parseBoolean(value) {
    return value === true || value === 'true' || value === 'on';
}

function createCaptchaSolver(captchaKey) {
    if (captchaKey?.trim()) {
        return async () => captchaKey.trim();
    }

    return async (captcha, userAgent) => {
        const err = new Error('CAPTCHA_REQUIRED');
        err.captcha = captcha;
        err.userAgent = userAgent;
        throw err;
    };
}

function formatCaptchaPayload(err) {
    const captcha = err.captcha || {};
    const sitekey = captcha.captcha_sitekey ||
        captcha.sitekey ||
        captcha.captcha_site_key ||
        captcha.hcaptcha_sitekey ||
        DISCORD_HCAPTCHA_SITEKEY;

    return {
        service: captcha.captcha_service || captcha.service || 'hcaptcha',
        sitekey,
        sitekeyFallback: sitekey === DISCORD_HCAPTCHA_SITEKEY && !captcha.captcha_sitekey,
        rqdata: captcha.captcha_rqdata || captcha.rqdata || '',
        rqtoken: captcha.captcha_rqtoken || captcha.rqtoken || '',
        userAgent: err.userAgent || '',
        raw: captcha
    };
}

app.get('/', async (req, res) => {
    const bumpConfig = await configManager.read('bump');
    const senderConfig = await configManager.normalizeSenderConfig();
    const tokens = await configManager.read('tokens');
    
    res.render('index', {
        bumpConfig,
        senderConfig,
        tokens,
        isRunning,
        current: 'index'
    });
});

app.get('/bump', async (req, res) => {
    const config = await configManager.read('bump');
    const tokens = await configManager.read('tokens');
    const groups = await configManager.read('groups');

    res.render('bump', {
        config,
        tokens: tokens.tokens,
        groups: groups.tokenGroups,
        isRunning,
        current: 'bump'
    });
});

app.post('/api/bump/config', async (req, res) => {
    try {
        const { humanize, humanizeMin, humanizeMax, maxServersPerToken } = req.body;
        const config = await configManager.read('bump');
        
        config.settings = {
            humanize: humanize === 'true',
            humanizeMin: parseInt(humanizeMin),
            humanizeMax: parseInt(humanizeMax),
            maxServersPerToken: parseInt(maxServersPerToken)
        };

        await configManager.write('bump', config);
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

app.post('/api/bump/server/add', async (req, res) => {
    try {
        const { serverId, bumpChannelId, tokenId, enabled } = req.body;
        const config = await configManager.read('bump');
        const tokensConfig = await configManager.read('tokens');

        if (!serverId || !bumpChannelId || !tokenId) {
            res.json({ success: false, error: 'Serveur, salon bump et token sont obligatoires' });
            return;
        }

        if (config.servers.some(server => server.serverId === serverId)) {
            res.json({ success: false, error: 'Serveur déjà existant dans le système' });
            return;
        }

        const selectedToken = tokensConfig.tokens.find(token => token.id === tokenId);

        if (!selectedToken) {
            res.json({ success: false, error: 'Token introuvable' });
            return;
        }

        const validation = await autoBumper.validateBumpTarget(selectedToken.token, serverId, bumpChannelId);
        if (!validation.valid) {
            res.json({ success: false, error: validation.error });
            return;
        }
        
        config.servers.push({
            id: Date.now().toString(),
            serverId,
            bumpChannelId,
            tokenId,
            name: validation.serverName,
            bumpChannelName: validation.channelName,
            enabled: enabled !== 'false',
            createdAt: new Date().toISOString()
        });

        await configManager.write('bump', config);
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

app.post('/api/bump/server/update', async (req, res) => {
    try {
        const { serverConfigId, bumpChannelId, tokenId } = req.body;
        const config = await configManager.read('bump');
        const tokensConfig = await configManager.read('tokens');
        const server = config.servers.find(item => item.id === serverConfigId);

        if (!server) {
            res.json({ success: false, error: 'Serveur introuvable' });
            return;
        }

        if (!bumpChannelId || !tokenId) {
            res.json({ success: false, error: 'Salon bump et token sont obligatoires' });
            return;
        }

        const selectedToken = tokensConfig.tokens.find(token => token.id === tokenId);
        if (!selectedToken) {
            res.json({ success: false, error: 'Token introuvable' });
            return;
        }

        const validation = await autoBumper.validateBumpTarget(selectedToken.token, server.serverId, bumpChannelId);
        if (!validation.valid) {
            res.json({ success: false, error: validation.error });
            return;
        }

        server.bumpChannelId = bumpChannelId;
        server.bumpChannelName = validation.channelName;
        server.tokenId = tokenId;
        server.name = validation.serverName;
        server.updatedAt = new Date().toISOString();

        await configManager.write('bump', config);
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

app.post('/api/bump/server/toggle', async (req, res) => {
    try {
        const { serverId, enabled } = req.body;
        const config = await configManager.read('bump');
        const server = config.servers.find(item => item.id === serverId);

        if (!server) {
            res.json({ success: false, error: 'Serveur introuvable' });
            return;
        }

        server.enabled = parseBoolean(enabled);
        server.updatedAt = new Date().toISOString();
        await configManager.write('bump', config);

        if (config.enabled && server.enabled && !autoBumper.bumpSchedules.has(server.tokenId)) {
            autoBumper.startBumping();
        }

        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

app.post('/api/bump/server/remove', async (req, res) => {
    try {
        const { serverId } = req.body;
        const config = await configManager.read('bump');
        
        config.servers = config.servers.filter(s => s.id !== serverId);
        await configManager.write('bump', config);
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

app.post('/api/bump/server/reorder', async (req, res) => {
    try {
        const { serverIds } = req.body;
        const config = await configManager.read('bump');

        if (!Array.isArray(serverIds)) {
            res.json({ success: false, error: 'Ordre invalide' });
            return;
        }

        const serverById = new Map(config.servers.map(server => [server.id, server]));
        const uniqueIds = new Set(serverIds);

        if (uniqueIds.size !== config.servers.length || serverIds.some(serverId => !serverById.has(serverId))) {
            res.json({ success: false, error: 'Liste de serveurs invalide' });
            return;
        }

        config.servers = serverIds.map(serverId => serverById.get(serverId));
        await configManager.write('bump', config);
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

app.post('/api/bump/enable', async (req, res) => {
    try {
        const config = await configManager.read('bump');
        config.enabled = true;
        await configManager.write('bump', config);
        
        if (!isRunning) {
            isRunning = true;
            autoBumper.startBumping();
        }
        
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

app.post('/api/bump/disable', async (req, res) => {
    try {
        const config = await configManager.read('bump');
        config.enabled = false;
        await configManager.write('bump', config);
        
        await autoBumper.stopAll();
        isRunning = false;
        
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

app.get('/sender', async (req, res) => {
    const config = await configManager.normalizeSenderConfig();
    const tokens = await configManager.read('tokens');
    const groups = await configManager.read('groups');

    res.render('sender', {
        config,
        tokens: tokens.tokens,
        groups: groups.tokenGroups,
        channelGroups: groups.channelGroups || [],
        isRunning,
        current: 'sender'
    });
});

app.post('/api/sender/message/add', async (req, res) => {
    try {
        const { content, useGlobalTokens, useGlobalChannels, tokenGroupId, channelGroupId } = req.body;
        const config = await configManager.normalizeSenderConfig();
        
        config.messages.push({
            id: Date.now().toString(),
            content,
            useGlobalTokens: parseBoolean(useGlobalTokens),
            useGlobalChannels: parseBoolean(useGlobalChannels),
            tokenGroupId: tokenGroupId || null,
            channelGroupId: channelGroupId || null,
            specificTokenIds: req.body.specificTokenIds || [],
            specificChannelIds: req.body.specificChannelIds || [],
            customDelay: req.body.customDelay ? configManager.normalizeDelaySeconds(req.body.customDelay) : null,
            enabled: true,
            createdAt: new Date().toISOString()
        });

        await configManager.write('sender', config);
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

app.post('/api/sender/message/remove', async (req, res) => {
    try {
        const { messageId } = req.body;
        const config = await configManager.read('sender');
        const initialLength = config.messages.length;

        config.messages = config.messages.filter(message => message.id !== messageId);

        if (config.messages.length === initialLength) {
            res.json({ success: false, error: 'Message introuvable' });
            return;
        }

        await configManager.write('sender', config);
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

app.post('/api/sender/enable', async (req, res) => {
    try {
        const config = await configManager.normalizeSenderConfig();
        config.enabled = true;
        await configManager.write('sender', config);
        
        if (!isRunning) {
            isRunning = true;
            autoSender.startSending();
        }
        
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

app.post('/api/sender/disable', async (req, res) => {
    try {
        const config = await configManager.normalizeSenderConfig();
        config.enabled = false;
        await configManager.write('sender', config);
        
        await autoSender.stopAll();
        isRunning = false;
        
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

app.get('/tokens', async (req, res) => {
    const tokens = await configManager.read('tokens');
    const groups = await configManager.read('groups');

    res.render('tokens', {
        tokens: tokens.tokens,
        groups,
        current: 'tokens'
    });
});

app.post('/api/tokens/add', async (req, res) => {
    try {
        const { token, name, group } = req.body;
        await configManager.addToken(token, name, group || 'default');
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

app.get('/channels', async (req, res) => {
    const sender = await configManager.normalizeSenderConfig();
    const tokens = await configManager.read('tokens');
    const groups = await configManager.read('groups');

    res.render('channels', {
        channels: sender.globalChannels || [],
        tokens: tokens.tokens,
        groups,
        current: 'channels'
    });
});

app.post('/api/channels/add', async (req, res) => {
    try {
        const { channelId, tokenId, group } = req.body;
        const tokensConfig = await configManager.read('tokens');

        if (!channelId || !channelId.trim()) {
            res.json({ success: false, error: 'ID de salon obligatoire' });
            return;
        }

        if (!tokenId) {
            res.json({ success: false, error: 'Token obligatoire' });
            return;
        }

        const selectedToken = tokensConfig.tokens.find(token => token.id === tokenId);
        if (!selectedToken) {
            res.json({ success: false, error: 'Token introuvable' });
            return;
        }

        const validation = await autoSender.validateChannelTarget(selectedToken.token, channelId.trim());
        if (!validation.valid) {
            res.json({ success: false, error: validation.error });
            return;
        }

        await configManager.addChannel(channelId, validation.channelName, tokenId, group || 'default');
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

app.post('/api/channels/update', async (req, res) => {
    try {
        const { channelConfigId, channelId, tokenId, group } = req.body;
        const tokensConfig = await configManager.read('tokens');

        if (!tokenId) {
            res.json({ success: false, error: 'Token obligatoire' });
            return;
        }

        const selectedToken = tokensConfig.tokens.find(token => token.id === tokenId);
        if (!selectedToken) {
            res.json({ success: false, error: 'Token introuvable' });
            return;
        }

        const validation = await autoSender.validateChannelTarget(selectedToken.token, channelId.trim());
        if (!validation.valid) {
            res.json({ success: false, error: validation.error });
            return;
        }

        const updated = await configManager.updateChannel(channelConfigId, {
            channelId,
            name: validation.channelName,
            tokenId,
            group: group?.trim() || 'default'
        });

        if (!updated) {
            res.json({ success: false, error: 'Salon introuvable' });
            return;
        }

        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

app.post('/api/channels/remove', async (req, res) => {
    try {
        const { channelConfigId } = req.body;
        const removed = await configManager.removeChannel(channelConfigId);

        if (!removed) {
            res.json({ success: false, error: 'Salon introuvable' });
            return;
        }

        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

app.post('/api/channels/reorder', async (req, res) => {
    try {
        const { channelConfigIds } = req.body;

        if (!Array.isArray(channelConfigIds)) {
            res.json({ success: false, error: 'Ordre invalide' });
            return;
        }

        const reordered = await configManager.reorderChannels(channelConfigIds);

        if (!reordered) {
            res.json({ success: false, error: 'Liste de salons invalide' });
            return;
        }

        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

app.post('/api/channels/group/create', async (req, res) => {
    try {
        const { groupName } = req.body;
        await configManager.addChannelGroup(groupName);
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

app.post('/api/channels/group/delete', async (req, res) => {
    try {
        const { groupName } = req.body;
        await configManager.removeChannelGroup(groupName);
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

app.post('/api/tokens/update', async (req, res) => {
    try {
        const { tokenId, token, name, group } = req.body;

        if (!token || !token.trim()) {
            res.json({ success: false, error: 'Token vide' });
            return;
        }

        const updated = await configManager.updateToken(tokenId, {
            token: token.trim(),
            name: name?.trim(),
            group: group?.trim() || 'default'
        });

        if (!updated) {
            res.json({ success: false, error: 'Token introuvable' });
            return;
        }

        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

app.post('/api/tokens/remove', async (req, res) => {
    try {
        const { tokenId } = req.body;
        const removed = await configManager.removeToken(tokenId);

        if (!removed) {
            res.json({ success: false, error: 'Token introuvable' });
            return;
        }

        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

app.post('/api/tokens/reorder', async (req, res) => {
    try {
        const { tokenIds } = req.body;

        if (!Array.isArray(tokenIds)) {
            res.json({ success: false, error: 'Ordre invalide' });
            return;
        }

        const reordered = await configManager.reorderTokens(tokenIds);

        if (!reordered) {
            res.json({ success: false, error: 'Liste de tokens invalide' });
            return;
        }

        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

app.post('/api/tokens/join', async (req, res) => {
    const client = new Client({
        captchaSolver: createCaptchaSolver(req.body.captchaKey)
    });

    try {
        const { tokenId, invite } = req.body;

        if (!tokenId) {
            res.json({ success: false, error: 'Token obligatoire' });
            return;
        }

        if (!invite || !invite.trim()) {
            res.json({ success: false, error: "Lien d'invitation obligatoire" });
            return;
        }

        const tokensConfig = await configManager.read('tokens');
        const selectedToken = tokensConfig.tokens.find(token => token.id === tokenId);

        if (!selectedToken) {
            res.json({ success: false, error: 'Token introuvable' });
            return;
        }

        await client.login(selectedToken.token);
        const inviteInfo = await client.fetchInvite(invite.trim());
        const alreadyJoined = Boolean(inviteInfo.guild?.id && client.guilds.cache.has(inviteInfo.guild.id));
        const joined = await client.acceptInvite(invite.trim(), {
            bypassOnboarding: true,
            bypassVerify: true
        });

        res.json({
            success: true,
            alreadyJoined,
            name: joined?.name || inviteInfo.guild?.name || inviteInfo.channel?.name || 'Invitation acceptee'
        });
    } catch (err) {
        if (err.message === 'CAPTCHA_REQUIRED') {
            res.json({
                success: false,
                requiresCaptcha: true,
                captcha: formatCaptchaPayload(err),
                error: 'Captcha requis. Renseignez la reponse hCaptcha puis relancez.'
            });
            return;
        }

        res.json({ success: false, error: err.message });
    } finally {
        try {
            await client.destroy();
        } catch {
            // Ignore cleanup errors after joining.
        }
    }
});

app.post('/api/tokens/group/create', async (req, res) => {
    try {
        const { groupName } = req.body;
        await configManager.addTokenGroup(groupName);
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

app.post('/api/tokens/group/delete', async (req, res) => {
    try {
        const { groupName } = req.body;
        await configManager.removeTokenGroup(groupName);
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

app.get('/webhooks', async (req, res) => {
    const webhooks = await configManager.read('webhook');
    res.render('webhooks', { webhooks, current: 'webhooks' });
});

app.post('/api/webhooks/config', async (req, res) => {
    try {
        const { enabled, url, logErrors, logSuccess } = req.body;
        const config = {
            enabled: parseBoolean(enabled),
            url,
            logErrors: parseBoolean(logErrors),
            logSuccess: parseBoolean(logSuccess)
        };

        await configManager.write('webhook', config);
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

app.post('/api/webhooks/enable', async (req, res) => {
    try {
        const config = await configManager.read('webhook');
        config.enabled = true;
        await configManager.write('webhook', config);
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

app.post('/api/webhooks/disable', async (req, res) => {
    try {
        const config = await configManager.read('webhook');
        config.enabled = false;
        await configManager.write('webhook', config);
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

app.post('/api/validate-token', async (req, res) => {
    try {
        const { token, channelId } = req.body;
        const result = await autoBumper.validateToken(token, channelId);
        res.json(result);
    } catch (err) {
        res.json({ valid: false, error: err.message });
    }
});

export async function startGUI() {
    await configManager.initialize();
    await autoBumper.initialize();
    await autoSender.initialize();
    await logger.initialize();

    app.listen(PORT, () => {
        const url = `http://localhost:${PORT}`;
        console.log(`
GUI disponible sur: ${url}
`);
        if (!process.env.DISABLE_BROWSER_OPEN) {
            openBrowser(url);
        }
    });
}
