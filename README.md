# @pikoman/ws

The JavaScript client for [Pikoman](https://pikoman.se), a hosted WebSocket service: public channels,
presence channels with a member list, private channels and end-to-end encrypted channels. It also
has what a Node backend, bot or script needs: request tokens and `publish` for the HTTP API, join
tokens signed with an API key, and the encryption helpers. Web Crypto only, no dependencies.

**1.0 speaks protocol 2.0.** It needs an app from the [dashboard](https://pikoman.se/dashboard/) and
does not work with 1.x apps or servers. What changed: [Protocol 2.0](https://pikoman.se/docs/v2/).

```bash
npm install @pikoman/ws@next     # 1.x release candidates: protocol 2.0
npm install @pikoman/ws          # 0.x: protocol 1.x, until 1.0.0 is released
```

While 2.0 runs next to 1.x, the release candidate connects to `wss://next.pikoman.se`. 1.0.0 will
connect to `wss://ws.pikoman.se` when 2.0 moves there; nothing else changes.

## Use

```js
import Pikoman from "@pikoman/ws";

const pikoman = new Pikoman("app-yourapp", {
  // Your backend's endpoint that signs join tokens: GET {auth_url}/{clientId}-{channel}
  // answers {"token": "<JWT>"}. Only needed for presence- and private- channels.
  auth_url: "/pikoman/auth",
});

// Public channel: anyone with the app id can listen.
pikoman.listen("orders").on("order-shipped", (data) => console.log(data.id));

// Presence: who is here, and messages between the members.
const room = pikoman.listenPresence("presence-room");
room.onClient("typing", (from, data) => console.log(from, data)); // events from other members: sender first
room.send("typing", { on: true });               // sent as client-typing; a third argument true also echoes it to you
room.members((members) => console.log([...members.values()]));  // Map of connection id to member data

// Private: only for those your backend signs a token for.
pikoman.listenPrivate("private-user-123").on("notification", (data) => console.log(data));

// A single-page app that no longer needs the connection: close it for good.
pikoman.close();
```

Events between members (client events) are named `client-…`, and events your backend publishes
never are, so a member can never send something that looks published by your backend. `send("typing")`
sends `client-typing` (a name that already starts with `client-` is kept as it is), and
`onClient("typing", fn)` is the same as `on("client-typing", fn)`. `clientMessage(fn)` gets every
client event as `fn(from, "client-typing", data)`.

`close()` closes the socket, stops every timer, removes the page listeners and never reconnects; a
new `Pikoman` connects again. When the connection is lost, the client connects again after a random
wait below 1 s, then below 2, 4, 8 s and so on up to 30 s while attempts fail, and starts over from
1 s once a connection has lasted 30 s. A callback of yours that throws (`offline`, `online`, `on`,
`refused`, …) stops neither the library nor the other callbacks: the library reconnects or joins
first, and the error is thrown again on its own.

## Publish from a backend

Messages to a channel are published from your backend over HTTP, signed with an API key from the
dashboard. The secret looks like `sk_k_<16 hex>.<43 characters>` and goes in `PIKOMAN_API_KEY`,
never in frontend code.

```js
import { publish, Rest } from "@pikoman/ws";   // or "@pikoman/ws/dist/server": no websocket client

// Reads PIKOMAN_APP and PIKOMAN_API_KEY (and PIKOMAN_ENCRYPTION_KEY for encrypted channels).
await publish("orders", "order-shipped", { id: 1042 });

// Or with explicit settings; address defaults to https://next-api.pikoman.se.
const rest = new Rest({ app: "app-yourapp", apiKey: process.env.PIKOMAN_API_KEY });
await rest.publish("orders", "order-shipped", { id: 1042 });
```

Each request carries `Authorization: Bearer <jwt>`: an EdDSA JWT with `kid` (the key id) in the
header, made for that one request and never reused. Its claims are `iss` (the app id), `iat`,
`exp` (`iat` + 60), `htm` (the method, `POST`), `htu` (the path with its query string as fetch
sends it: no scheme or host, and an empty query, a lone `?`, left out) and `bh` (SHA-256 of the
exact body, base64url without padding; for no body, of the empty string). So a token seen in a log
works for no other request, and only for a minute. `Rest` signs a new one for every request. Event
names that start with `client-` are members' client events, and `publish` refuses them, as it
refuses empty channel and event names and `.` and `..`, which a URL reads as steps in the path. An
event's data may be at most 12 KiB. Data with no JSON form (a function, a symbol) is
refused; `undefined` is sent as `null`. `Rest`, `OfflineAuthenticator.fromSecret` and
`MasterKeyAuthenticator` refuse to run in a browser page: what holds a secret key belongs on a
server. `Rest` takes only an `https://` address (`http://` only to localhost), so a typo cannot
send its tokens in the clear; outside a browser the same goes for `ws_address`, which must be
`wss://` (`ws://` only to localhost). For other requests (stats, clients, disconnect), make the
header yourself:

```js
import { authorizationHeader } from "@pikoman/ws";

const url = "https://next-api.pikoman.se/orders/stats";
const res = await fetch(url, {
  headers: {
    Authorization: await authorizationHeader(process.env.PIKOMAN_API_KEY, "app-yourapp", { method: "GET", url }),
  },
});
```

`requestToken(apiKey, appId, { method, url, body })` gives the JWT alone. `url` is the URL or the
path, with the query string, as it is sent (signed as Node's fetch sends it, `pathname + search`,
so a lone `?` is left out); `body` is the text or bytes exactly as sent (leave it out for none). Make a new token for every request. Both take the `sk_` secret or
`{ keyId, key }` with an imported key; without `keyId` they throw, since the server finds the key
by the `kid`. Lifetimes of join tokens are whole seconds (rounded down), at most 600.

## Join tokens

Your backend signs an EdDSA JWT with one of the app's signing keys, for one connection and one
channel, valid for at most 10 minutes. Endpoints for Node and PHP are in the
[quickstart](https://pikoman.se/docs/#token). The private key never goes in frontend code.

`OfflineAuthenticator` signs them without a token endpoint, in a backend or a bot:

```js
import Pikoman, { OfflineAuthenticator } from "@pikoman/ws";

// With a signing key (PKCS#8, PEM or base64 on one line). The key id is optional and goes in
// the token's header as `kid`, so the server checks that key only.
const auth = new OfflineAuthenticator({ name: "Anna" }, process.env.PIKOMAN_PRIVATE_KEY, 3,
  process.env.PIKOMAN_SIGNING_KEY_ID);

// As a bot, with an API key that has `subscribe` (access 3 also needs `client_events`).
const bot = OfflineAuthenticator.fromSecret(process.env.PIKOMAN_API_KEY, { name: "Bot" }, 3);
pikoman.listenPresence("presence-room", bot);
```

With a signing key, `OfflineAuthenticator` puts the private key wherever it runs. In a browser
page it is refused unless the page is served from localhost, or passes `{ allowInBrowser: true }`
as the fifth argument: only for a page that tries things out with a key its visitor types in, never
for a key you ship.

`HttpAuthenticator` asks `{auth_url}/{connection id}-{channel}`, and refuses a channel name the
server would not take (1-164 characters of `A-Z a-z 0-9 _ - = @ , . ;`), so a name taken from a URL
cannot point the request at another path on your backend. App ids are checked the same way.

`parseSecret(secret)` reads an `sk_` secret into `{ keyId, seed }` and throws on anything malformed.

### Bots in presence channels

A member that joined with an API key is a bot. The server says so next to the member data, never in
it: member data is the app's own, exactly as the join token gave it, so a user whose data says
`"bot": true` is not a bot. Only the server's list can be trusted, and the presence channel keeps it
in step with joins and leaves:

```js
const room = pikoman.listenPresence("presence-room");
room.isBot(id);    // true only for members that joined with an API key
room.botKey(id);   // the id of the API key a bot joined with ("k_…"), undefined for everyone else
room.getBots();    // Map of connection id to key id

// Who sent a client event: the relay sets `from`, so this tells a bot from a person.
room.onClient("status", (from, data) => {
  if (room.isBot(from)) console.log(`bot ${room.botKey(from)}:`, data);
});
```

Over HTTP, `GET /{channel}/clients` answers `{"clients": {id: data}, "bots": {id: key id}}`, with
`bots` left out when there are none.

### To one member

`sendTo` sends a client event to one member of the channel and nobody else: a connection (its id,
as in the member list or a client event's `from`), or every connection of a user (the `user_id` in
their signed member data). A bot answers whoever asked; a backend can push the same way:

```js
room.onClient("history", (from, data, info) => {
  // info.userId: the user id in the sender's signed member data; info.bot: a bot's API key.
  room.sendTo(from, "history", lastMessages());          // that connection only
  if (info?.userId) room.sendTo({ userId: info.userId }, "history", lastMessages());  // every tab
});
room.on("missed", (data, info) => info?.direct);         // a push to this member alone

await rest.publish("presence-room", "missed", items, { toUser: "42" });  // POST …?to_user=42
await rest.publish("presence-room", "missed", items, { to: "c_…" });     // POST …?to=c_…
```

Only members of the channel can be reached; anyone else is refused with `refused("no_such_member")`
(over HTTP the answer is `{"clients": 0}`). Handlers get a last argument `info` only when the
server says more than before: `direct`, `userId`, `bot`. The server sets these; a sender cannot.

### Moderation: kick and ban

A bot whose API key has the `kick` right for a channel removes a member from that channel only;
with the `ban` right it can also keep the member out for a while (at most a day). The key's kinds,
prefixes and exact names apply, so a moderator limited to `presence-chat-` can do nothing in
`presence-admin`. A user's connection can never kick, and a bot can kick neither itself nor
another bot. (`disconnect` is not this: it closes a whole connection, in every channel of the app.)

```js
room.onClient("message", (from, data, info) => {
  if (isSpam(data)) room.kick(from, { reason: "No spam, please" });                // that connection
  if (isAbuse(data)) room.kick({ userId: info.userId }, { reason: "Bye", banSeconds: 600 }); // every tab, 10 min
});

// The member that was removed:
room.kicked(({ reason, banSeconds }) => showModal(`You were removed: ${reason ?? ""}`));
room.refused((code) => code === "banned" && showModal("You may not join this room yet."));

// From a backend (DELETE /{channel}/clients?to_user=42&reason=…&ban_seconds=600):
await rest.kick("presence-chat-1", { userId: "42" }, { reason: "Bye", banSeconds: 600 });
// → { kicked: 1, banned: true }
```

The member gets `kicked({ reason, banSeconds })` and leaves the channel; its connection and other
channels stay, and the library does not join that channel again on reconnect (listen again to
rejoin). The others see an ordinary leave, and a `member_removed` webhook says `"reason": "kicked"`
and which key did it. A banned connection or user id is refused with `refused("banned")` until the
ban runs out or the channel empties. A kick counts against the bot's 10 client events a second.

### The channel list and message counts

```js
const { channels, next, app_message_count } =
  await rest.channels({ prefix: "chat-", info: ["user_count", "message_count"], limit: 100 });
await rest.stats("chat-1");   // { clients, message_count }
```

`GET /channels` needs the `stats` right and lists only channels the key may see. `message_count` is
the messages sent in a channel (pushes and client events) since it became occupied: it starts at
0 when its first member joins and goes when the last one leaves.

## Refusals, and when access is taken away

Everything the server or the library refuses for a channel reaches `channel.refused(fn)` as a code.
When a key is deleted or narrowed in the dashboard, the server acts at once, also on connections
that only listen:

| What changed | What the app gets |
|---|---|
| The API key a connection signed in with was deleted | `pikoman.revoked(fn)` (after `offline`): closed with 4403, no reconnect |
| That API key was narrowed and no longer allows a channel | `refused("not_allowed")`, then the channel is left; the connection stays |
| The signing key that signed a join token was deleted | `refused("key_revoked")`; the library joins again with a new token (1 s, 2 s, 4 s), then `refused("rejoin_failed")` |

```js
const pikoman = new Pikoman("app-123", {
	auth_url: "/pikoman/auth",
	// rejoin_on_revoke: false,  // handle key_revoked yourself, e.g. with room.join()
});

pikoman.revoked(() => showModal("Your access was removed."));  // 4403: stays offline
pikoman.offline(() => showBanner("Reconnecting …"));          // once per lost connection; reconnects with backoff

const room = pikoman.listenPresence("presence-room");
room.refused((code) => {
	if (code === "key_revoked") showToast("Joining the room again …");
	else if (code === "rejoin_failed") showModal("Could not join the room again. Reload the page.");
	else if (code === "channel_full") showModal("The room is full.");
	else console.warn("Pikoman:", code);  // not_allowed, join_refused, rate_limited, data_too_large, …
});
```

A presence channel is full at 500 members, or when its member list would pass 64 KiB; a member's
data may be at most 1 KiB, and an event's data at most 12 KiB (a client event over it is refused
with `data_too_large`). A connection may send at most 10 client events a second. A client event
without the `client-` prefix is refused with `invalid_event_name`; this library always adds it.

## End-to-end encrypted channels

Channels named `private-encrypted-…` carry only ciphertext: Pikoman relays what it cannot read.
Your backend keeps a 32-byte master key (`PIKOMAN_ENCRYPTION_KEY`, base64) that Pikoman never sees,
and gives each client the key for the channels it is let into.

```js
// Browser: join as with private channels. Events arrive decrypted; send encrypts.
const secret = pikoman.listenPrivate("private-encrypted-team-7");
secret.on("notice", (data) => console.log(data.text));                // published by your backend
secret.onClient("message", (from, data) => console.log(from, data.text)); // from other members
await secret.send("message", { text: "hej" });  // client-message; rejects if offline: nothing was sent
secret.refused((code) => console.warn(code));  // "decrypt_failed": a message was dropped
```

The token endpoint answers such a join with the channel key next to the token, and
`HttpAuthenticator` keeps it with the channel:

```js
import { channelKey } from "@pikoman/ws";

// In the token endpoint, after deciding the user may join `channel`:
res.json({ token, channel_key: await channelKey(process.env.PIKOMAN_ENCRYPTION_KEY, channel) });
```

A program that holds the master key needs no endpoint:

```js
import { MasterKeyAuthenticator, OfflineAuthenticator } from "@pikoman/ws";

const auth = new MasterKeyAuthenticator(
  OfflineAuthenticator.fromSecret(process.env.PIKOMAN_API_KEY),
  process.env.PIKOMAN_ENCRYPTION_KEY,
);
pikoman.listenPrivate("private-encrypted-team-7", auth);
```

`Rest`, `MasterKeyAuthenticator` and `OfflineAuthenticator` keep their keys only as
non-extractable Web Crypto keys, and `JSON.stringify` or `console.log` of them shows `[hidden]`
instead of a key or a token. `importMasterKey(base64)` gives such a key for `channelKey` too.

`publish` and `Rest` encrypt by themselves for these channels when they have the master key. By
hand: `encryptEvent(channel, event, data, channelKey, direction = "server")` gives
`{ nonce, ciphertext }` and `decryptEvent(channel, event, encrypted, channelKey, direction = "server")`
reads it back. The direction is `"server"` for what your backend publishes over HTTP and `"client"`
for client events between members (what `send` sends); the channel uses the right one by itself.

The cipher is AES-256-GCM with a fresh 12-byte nonce per message, the channel key is
HMAC-SHA256(master key, channel name), and `<direction>\n<channel>\n<event>` is authenticated with
every message (an event without a name uses ""). So a message cannot be moved to another channel,
passed off as another event, or turned from a member's message into one that looks published by
your backend, or back.

What it does not protect against:

- **Replay.** The relay could deliver the same ciphertext again. Put a timestamp or an id in the
  data and ignore repeats when that matters.
- **Who sent a client event.** `from` is set by the relay, and every member holds the same channel
  key. Put the sender's identity in the data (and sign it, if it matters) when members must trust it.

Not hidden: channel and event names, presence member data, the size and time of messages, and which
connections talk. Name channels so the name says nothing sensitive.

## Requirements

Browsers with Ed25519 in Web Crypto (only for signing in the page) and AES-GCM (every current
browser). Node 20 or later; Node 18 needs `globalThis.crypto = require("node:crypto").webcrypto`.
The websocket client in Node needs a global `WebSocket` (Node 22+).

## License

MIT
