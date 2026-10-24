import {webcrypto} from 'crypto';
import {TextDecoder, TextEncoder} from 'util';

/** Browsers and Node 20+ have these built in; Jest 26's node environment does not. */
export function installWebGlobals() {
    const g = globalThis as any;
    g.crypto = g.crypto ?? webcrypto;
    g.TextEncoder = g.TextEncoder ?? TextEncoder;
    g.TextDecoder = g.TextDecoder ?? TextDecoder;
    g.atob = g.atob ?? ((text: string) => Buffer.from(text, 'base64').toString('binary'));
    g.btoa = g.btoa ?? ((text: string) => Buffer.from(text, 'binary').toString('base64'));
}
