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

        return originalPatch.call(this, data);
    };

    patched = true;
}
