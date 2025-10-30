/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
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
        match: /^https:\/\/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?(track|album|artist)\/(.+)(?:\?.+?)?$/,
        shortlinkMatch: /^https:\/\/spotify\.link\/.+$/,
        name: "Spotify",
        platform: "spotify"
    },
    tidal: {
        match: /^https:\/\/tidal\.com\/(?:browse\/)?(track|album|artist)\/([^/?]+)(?:[/?].*)?$/,
        name: "Tidal",
        platform: "tidal"
    },
    itunes: {
        match: /^https:\/\/(?:geo\.)?music\.apple\.com\/([a-z]{2}\/)?(album|artist|song)\/([^/?#]+)\/?([^/?#]+)?(?:\?.*)?(?:#.*)?$/,
        name: "Apple Music",
        platform: "appleMusic"
    },
};

const pluginSettings = definePluginSettings({
    platform: {
        type: OptionType.SELECT,
        description: "What platform to convert the streaming links to",
        options: Object.values(Platforms).map(rule => ({ label: rule.name, value: rule.platform }))
    }
});


const Native = VencordNative.pluginHelpers.unifiedStreamingLink as PluginNative<typeof import("./native")>;

let clickHandler: any;

export default definePlugin({
    name: "UnifiedStreamingLink",
    description: "Automatically convert platform link to the chosen one",
    authors: [Devs.Aztup],
    settings: pluginSettings,

    start() {
        clickHandler = document.addEventListener('click', async (event) => {
            const { platform } = pluginSettings.store;
            if (!platform) return false;

            const link = (event.target as HTMLElement).closest('a');
            if (!link) return;

            let url = link.href;
            let detectedPlatform: string | undefined;

            for (const rule of Object.values(Platforms)) {
                if (rule.match.test(url) || rule.shortlinkMatch?.test(url)) {
                    detectedPlatform = rule.platform;
                    event?.preventDefault();
                    break;
                }
            }

            if (!detectedPlatform) return false;

            let platformUrl: string | undefined;

            if (detectedPlatform === platform) {
                platformUrl = url;
            } else {
                showToast(`Fetching ${Object.values(Platforms).find(r => r.platform === platform)?.name} link...`, Toasts.Type.CLOCK);
                const res = await Native.songLinkReq(url);
                console.log(res);

                platformUrl = res.linksByPlatform[platform]?.url;
            }

            if (Vencord.Plugins.plugins.OpenInApp && platformUrl) {
                // Force the link to open inside the app instead if the user has the open in app plugin
                (Vencord.Plugins.plugins.OpenInApp as any).handleLink({
                    href: platformUrl
                });

                return false;
            }

            // It's probably safe to open URL that match the regex because those are 'trusted' services
            return window.open(platformUrl ?? url, '__blank');
        });
    },

    stop() {
        document.removeEventListener('click', clickHandler);
    }
});
