import { createRequire } from 'module';

const require = createRequire(import.meta.url);

let patched = false;

export function applySelfbotCompatPatch() {
    if (patched) return;

    const ClientUserSettingManager = require('discord.js-selfbot-v13/src/managers/ClientUserSettingManager.js');
    const originalPatch = ClientUserSettingManager.prototype._patch;

    ClientUserSettingManager.prototype._patch = function patchUserSettings(data = {}) {
        if (data && data.friend_source_flags === null) {
            data = {
                ...data,
                friend_source_flags: {
                    all: false,
                    mutual_friends: false,
                    mutual_guilds: false
                }
            };
        }

        if (data && 'guild_folders' in data) {
            data = {
                ...data,
                guild_folders: Array.isArray(data.guild_folders) ? data.guild_folders : [],
                guild_positions: Array.isArray(data.guild_positions) ? data.guild_positions : []
            };
        }

        if (data && 'restricted_guilds' in data && !Array.isArray(data.restricted_guilds)) {
            data = {
                ...data,
                restricted_guilds: []
            };
        }

        return originalPatch.call(this, data);
    };

    patched = true;
}
