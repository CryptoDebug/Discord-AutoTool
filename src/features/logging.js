import axios from 'axios';
import chalk from 'chalk';
import { ConfigManager } from '../config/manager.js';

export class Logger {
    constructor() {
        this.configManager = new ConfigManager();
        this.webhookConfig = null;
    }

    async initialize() {
        this.webhookConfig = await this.configManager.read('webhook');
    }

    async log(level, message, data = null) {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

        switch (level) {
            case 'error':
                console.error(chalk.red(logMessage), data ? data : '');
                break;
            case 'warn':
                console.warn(chalk.yellow(logMessage), data ? data : '');
                break;
            case 'success':
                console.log(chalk.green(logMessage), data ? data : '');
                break;
            case 'info':
                console.log(chalk.blue(logMessage), data ? data : '');
                break;
            default:
                console.log(logMessage, data ? data : '');
        }

        if (this.webhookConfig?.enabled && this.webhookConfig?.url) {
            await this.sendToWebhook(level, message, data, timestamp);
        }
    }

    async sendToWebhook(level, message, data, timestamp) {
        try {
            if ((level === 'error' && this.webhookConfig.logErrors) || 
                (level !== 'error' && this.webhookConfig.logSuccess)) {
                
                const embed = {
                    title: `[${level.toUpperCase()}] Discord AutoTool`,
                    description: message,
                    color: this.getColor(level),
                    fields: data ? [
                        { name: 'D\u00e9tails', value: JSON.stringify(data, null, 2) }
                    ] : [],
                    timestamp: timestamp
                };

                await axios.post(this.webhookConfig.url, {
                    embeds: [embed]
                });
            }
        } catch (err) {
            console.error(chalk.red('Erreur envoi webhook:'), err.message);
        }
    }

    getColor(level) {
        const colors = {
            error: 16711680,
            warn: 16776960,
            success: 65280,
            info: 3447003
        };
        return colors[level] || 9807270;
    }

    error(msg, data) { return this.log('error', msg, data); }
    warn(msg, data) { return this.log('warn', msg, data); }
    success(msg, data) { return this.log('success', msg, data); }
    info(msg, data) { return this.log('info', msg, data); }
}
