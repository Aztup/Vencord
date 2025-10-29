/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2023 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType, PluginNative } from "@utils/types";
import { showToast, Toasts } from "@webpack/common";

interface Platform {
    match: RegExp;
    shortlinkMatch?: RegExp;
    name: string;
    platform: string;
}

const Platforms: Record<string, Platform> = {
    spotify: {
        match: /^https:\/\/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?(track|album|artist|playlist|user|episode|prerelease)\/(.+)(?:\?.+?)?$/,
        shortlinkMatch: /^https:\/\/spotify\.link\/.+$/,
        name: 'Spotify',
        platform: 'spotify'
    },
    tidal: {
        match: /^https:\/\/tidal\.com\/(track|album|artist|playlist|user|video|mix)\/(\d+).+/,
        name: 'Tidal',
        platform: 'tidal'
    },
    itunes: {
        match: /^https:\/\/(?:geo\.)?music\.apple\.com\/([a-z]{2}\/)?(album|artist|playlist|song|curator)\/([^/?#]+)\/?([^/?#]+)?(?:\?.*)?(?:#.*)?$/,
        name: 'Apple Music',
        platform: 'appleMusic'
    },
};

const pluginSettings = definePluginSettings({
    platform: {
        type: OptionType.SELECT,
        description: 'thing thing',
        options: Object.values(Platforms).map((rule) => ({ label: rule.name, value: rule.platform }))
    }
});


const Native = VencordNative.pluginHelpers.unifiedStreamingLink as PluginNative<typeof import("./native")>;

let clickHandler: any;

export default definePlugin({
    name: "unifiedStreamingLink",
    description: "Automatically convert platform link to the chosen one",
    authors: [Devs.Aztup],
    settings: pluginSettings,

    start() {
        clickHandler = document.addEventListener('click', async (event) => {
            const platform = pluginSettings.store.platform;
            if (!platform) return;

            const link = (event.target as HTMLElement).closest('a');
            if (!link) return;

            let url = link.href;
            let detectedPlatform: string | undefined;

            for (const rule of Object.values(Platforms)) {
                if (rule.shortlinkMatch?.test(url)) {
                    event?.preventDefault();
                    url = await Native.resolveRedirect(url);
                }

                if (rule.match.test(url)) {
                    detectedPlatform = rule.platform;
                    event.preventDefault();
                    break;
                }
            }

            if (!detectedPlatform) return;

            showToast(`Fetching ${Object.values(Platforms).find((r) => r.platform === platform)?.name} link...`, Toasts.Type.CLOCK);

            const data = detectedPlatform === platform ? { linksByPlatform: { [platform]: link.href } } : await Native.songLinkReq(link.href);

            const platformUrl = data.linksByPlatform[platform].url;
            if (!platformUrl) return;

            if (Vencord.Plugins.plugins.OpenInApp) {
                // Force the link to open inside the app instead if the user has the open in app plugin
                (Vencord.Plugins.plugins.OpenInApp as any).handleLink({
                    href: platformUrl
                });
            } else {
                window.open(platformUrl, '__blank');
            }
        });
    },

    stop() {
        document.removeEventListener('click', clickHandler);
    }
});
