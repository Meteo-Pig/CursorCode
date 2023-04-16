
import crypto = require('crypto');
import { exec } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
const axios = require("axios").default;

import * as vscode from "vscode";

const m = "https://cursor.so"
    , v = "https://aicursor.com"
    , w = "KbZUR41cY7W6zRSdpSUJ7I7mLYBKOCmB"
    , s = "cursor.us.auth0.com"
    , a = `${m}/api`
    , i = `${m}/loginDeepControl`
    , g = `${m}/pricing?fromControl=true`
    , c = `${m}/settings`
    , d = `${v}/auth/poll`;

function base64URLEncode(str: Buffer) {
    return str
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}
function sha256(buffer: Buffer) {
    return crypto.createHash('sha256').update(buffer).digest();
}

export async function loginCursor() {
    let uuid = uuidv4();
    let verifier = base64URLEncode(crypto.randomBytes(32));
    let challenge = base64URLEncode(sha256(Buffer.from(verifier)));
    // console.log({
    //     challenge,
    //     verifier,
    //     uuid
    // });

    let cmd = ''
    let url = `${i}?challenge=${challenge}&uuid=${uuid}`
    // if (process.platform === 'darwin') {
    //     cmd = `open "${url}"` // macOS
    // } else if (process.platform === 'win32') {
    //     cmd = `start "" "${url}"` // Windows
    // } else {
    //     cmd = `xdg-open "${url}"` // Linux
    // }
    // exec(cmd);
    vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(url));

    return await new Promise(resolve => {
        const timer = setInterval(async () => {
            const t = await axios.get(`${d}?uuid=${uuid}&verifier=${verifier}`)
            const data = t.data;
            // console.log(data);
            if (data) {
                clearInterval(timer);
                resolve(data);
            }
        }, 2 * 1e3);
      });

    // const timer = setInterval(async () => {

    //     const t = await axios.get(`${d}?uuid=${uuid}&verifier=${verifier}`)
    //     const data = t.data;
    //     console.log(data);
    //     if (data) {
    //         clearInterval(timer);
    //         return data;
    //     }
    // }, 2 * 1e3);
}
// login();