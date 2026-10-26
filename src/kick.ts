import { KickOptions } from "./types";

/** Longest kick reason the server takes, in bytes; longest ban, in seconds (a day). */
export const MAX_KICK_REASON_BYTES = 200;
export const MAX_BAN_SECONDS = 86400;

/** Bytes of a string as UTF-8, counted by hand: TextEncoder is missing in some test environments. */
function utf8Length(text: string): number {
	let bytes = 0;
	for (const char of text) {
		const code = char.codePointAt(0) ?? 0;
		bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
	}
	return bytes;
}

/** The `reason` and `ban_seconds` of a kick, checked as the server checks them. Throws for anything else. */
export function kickFields(options: KickOptions = {}): { reason?: string, ban_seconds?: number } {
	const fields: { reason?: string, ban_seconds?: number } = {};
	const { reason, banSeconds } = options;
	if (reason !== undefined && reason !== "") {
		if (typeof reason !== "string" || utf8Length(reason) > MAX_KICK_REASON_BYTES) {
			throw new Error(`Pikoman: a kick's reason is a string of at most ${MAX_KICK_REASON_BYTES} bytes`);
		}
		fields.reason = reason;
	}
	if (banSeconds !== undefined && banSeconds !== 0) {
		if (!Number.isInteger(banSeconds) || banSeconds < 0 || banSeconds > MAX_BAN_SECONDS) {
			throw new Error(`Pikoman: banSeconds is a whole number from 0 to ${MAX_BAN_SECONDS}`);
		}
		fields.ban_seconds = banSeconds;
	}
	return fields;
}
