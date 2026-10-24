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
room.on("typing", (from, data) => console.log(from, data)); // events from other members: sender first
room.send("typing", { on: true });                            // a third argument true also echoes it to you
room.members((members) => console.log([...members.values()]));  // Map of connection id to member data

// Private: only for those your backend signs a token for.
pikoman.listenPrivate("private-user-123").on("notification", (data) => console.log(data));
```

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
header and `iss` (the app id), `iat` and `exp` (at most 10 minutes) as claims. `Rest` makes one
that lives five minutes and reuses it for four; a token the server refuses with 401 is dropped and
the request tried once more with a fresh one. Data with no JSON form (a function, a symbol) is
refused; `undefined` is sent as `null`. `Rest`, `OfflineAuthenticator.fromSecret` and
`MasterKeyAuthenticator` refuse to run in a browser page: what holds a secret key belongs on a
server. For other requests (stats, clients, disconnect), make the header yourself:

```js
import { authorizationHeader } from "@pikoman/ws";

const res = await fetch("https://next-api.pikoman.se/orders/stats", {
  headers: { Authorization: await authorizationHeader(process.env.PIKOMAN_API_KEY, "app-yourapp") },
});
```

`requestToken(apiKey, appId, lifetimeSeconds = 300)` gives the JWT alone. Both take the `sk_` secret
or `{ keyId, key }` with an imported key; without `keyId` they throw, since the server finds the key
by the `kid`. Lifetimes of request and join tokens are whole seconds (rounded down), at most 600.

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
room.on("status", (from, data) => {
  if (room.isBot(from)) console.log(`bot ${room.botKey(from)}:`, data);
});
```

Over HTTP, `GET /{channel}/clients` answers `{"clients": {id: data}, "bots": {id: key id}}`, with
`bots` left out when there are none.

## End-to-end encrypted channels

Channels named `private-encrypted-…` carry only ciphertext: Pikoman relays what it cannot read.
Your backend keeps a 32-byte master key (`PIKOMAN_ENCRYPTION_KEY`, base64) that Pikoman never sees,
and gives each client the key for the channels it is let into.

```js
// Browser: join as with private channels. Events arrive decrypted; send encrypts.
const secret = pikoman.listenPrivate("private-encrypted-team-7");
secret.on("message", (data) => console.log(data.text));
await secret.send("message", { text: "hej" });  // rejects if offline: nothing was sent
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
