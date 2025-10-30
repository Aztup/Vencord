/*
 * Vencord, a Discord client mod
 * Copyright (c) 2023 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { VENCORD_USER_AGENT } from "@shared/vencordUserAgent";
import { IpcMainInvokeEvent } from "electron";

const BASE_URL = 'https://api.song.link/v1-alpha.1';

export async function songLinkReq(_: IpcMainInvokeEvent, url: string) {
    const req = await fetch(`${BASE_URL}/links?url=${new URL(url)}`, {
        headers: {
            "user-agent": VENCORD_USER_AGENT
        }
    });

    return await req.json();
}