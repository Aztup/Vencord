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
import definePlugin, { OptionType } from "@utils/types";
import { findByProps } from "@webpack";

const settings = definePluginSettings({
    spotify: {
        type: OptionType.BOOLEAN,
        description: "Open Spotify links in the Spotify app",
        default: true,
    },
    steam: {
        type: OptionType.BOOLEAN,
        description: "Open Steam links in the Steam app",
        default: true,
    },
    epic: {
        type: OptionType.BOOLEAN,
        description: "Open Epic Games links in the Epic Games Launcher",
        default: true,
    },
    tidal: {
        type: OptionType.BOOLEAN,
        description: "Open Tidal links in the Tidal app",
        default: true,
    }
});

export default definePlugin({
    name: "TidalRichPresence",
    description: "Open Spotify, Tidal, Steam and Epic Games URLs in their respective apps instead of your browser",
    authors: [Devs.Nobody],
    settings,

    patches: [
        {
            find: 'discordapp.com|discord.com',
            replacement: {
                match: /\|discordapp.com\|discord\.com\)\$/,
                replace: (code, funcName) => '|discordapp.com|desktop.tidal.com|discord.com)$'
            }
        }
    ],

    start: async () => {
        const { socket, localPresenceState } = findByProps('socket');
        const ipcServer = findByProps('handleConnection');
        const endpoints = findByProps('Endpoints').Endpoints;
        const HTTP = findByProps('HTTP').HTTP;

        const { body } = await HTTP.get({ url: endpoints.CONNECTIONS });
        let { access_token, id, type } = body.find((endpoint) => endpoint.type === 'spotify');

        let lastPlayingTrack;
        let foundTrack;
        let abortController: AbortController | undefined;

        let lastTokenRefreshAt = Date.now();

        let oldSend = socket.send;
        let tokenTTL = 10 * 60 * 1000;

        socket.send = function (...params: any) {
            console.log(params);

            return oldSend.call(this, ...params);
        };

        ipcServer.on('request', async (client, payload) => {
            console.log(payload);

            if (Date.now() - lastTokenRefreshAt > tokenTTL) {
                lastTokenRefreshAt = Date.now();
                const { body: refreshReqBody } = await HTTP.get({ url: endpoints.CONNECTION_ACCESS_TOKEN(type, id) });
                // const body = await refreshReq

                console.log('refreshed token', refreshReqBody);
                access_token = refreshReqBody.access_token ?? access_token;
            }

            if (payload.cmd === 'TIDAL_RICH_PRESENCE') {
                const { fullName, duration, isPaused, position } = payload.data;
                const { status, since, activities, afk, broadcast } = localPresenceState.state;

                // If track is not the same then fetch the trackInfo
                if (!lastPlayingTrack || lastPlayingTrack.fullName != fullName) {
                    if (abortController) abortController.abort();
                    abortController = new AbortController();

                    const response = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(fullName)}&type=track&include_external=audio`, {
                        signal: abortController.signal,
                        headers: {
                            'Authorization': `Bearer ${access_token}`
                        }
                    });

                    // Invalid token
                    if (!response.ok && response.status === 401) lastTokenRefreshAt = 0;

                    const { tracks: { items } } = await response.json();
                    const durationInMs = duration * 1000;

                    // Find a track with a very close duration
                    foundTrack = items.find((track) => Math.abs(track.duration_ms - durationInMs) <= 10 * 1000);
                    lastPlayingTrack = foundTrack && { fullName };
                }

                const playedAt = Date.now() - position * 1000;
                const endAt = playedAt + duration * 1000;

                const tidalActivity = {
                    type: 2,
                    name: "Spotify",
                    assets: {
                        large_image: `spotify:${foundTrack.album.images[0].url.match(/image\/(\w+)/)[1]}`,
                        large_text: foundTrack.album.name
                    },
                    details: foundTrack.name,
                    state: foundTrack.artists.slice(0, 5).map((artist) => artist.name).join('; '),
                    timestamps: {
                        start: playedAt,
                        end: endAt
                    },
                    party: {
                        id: "spotify:751436182252027936"
                    },
                    sync_id: Date.now().toString(),
                    flags: 0,
                    metadata: {
                        album_id: foundTrack.album.id,
                        artist_ids: foundTrack.artists.slice(0, 5).map((artist) => artist.id),
                        type: "track",
                        button_urls: []
                    }
                };

                console.log(status, since, [!isPaused ? tidalActivity : undefined], afk, broadcast);
                socket.presenceUpdate(status, since, [!isPaused ? tidalActivity : undefined, ...activities], afk, broadcast);
            }
        });
    }
});
