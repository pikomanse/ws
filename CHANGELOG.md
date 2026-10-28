# Changelog

## 1.0.0-rc.11 (not published yet)

**Breaks token endpoints**: `HttpAuthenticator` (what `auth_url` uses) now asks with
`POST {auth_url}` and the JSON body `{"connection_id": "c_…", "channel": "…"}`, as pusher-js posts
to its auth endpoint, instead of `GET {auth_url}/{connection id}-{channel}`. The answer is the same,
`{"token": "…"}` (and `channel_key` for an encrypted channel). Change the route on your backend:

```js
// was: app.get("/pikoman/auth/:join", …) with req.params.join.split(/-(.*)/)
app.post("/pikoman/auth", express.json(), async (req, res) => {
  const { connection_id, channel } = req.body;
  // … as before
});
```

**`OfflineAuthenticator` is now `TokenSigner`**, a name for what it does: it signs join tokens
with a key, in a backend or a bot, and nothing about it is offline. `OfflineAuthenticator` stays as
another name for the same class, so code written for rc.10 keeps working.

Added: **`auth_headers`**, headers sent with every token request (Laravel's `X-CSRF-TOKEN`, a
bearer token), or a function called at each request. A POST route in Laravel's `web` group needs
the CSRF token; the GET route did not.

## 1.0.0-rc.10 (published 2026-10-27)

Added, nothing breaks:

- **`paused(fn)`**: the server closed this bot's connection with **4402**, because its API key's
  bot rights are paused (the app's owner is no longer on Pro). Unlike 4403 it is not for good:
  the client tries again after one to two minutes, then less often, at most every five, and joins
  its channels again once the rights are back. `offline` is called first. Before, such a key was
  removed and the bot got 4403 and stayed offline even after Pro returned.

## 1.0.0-rc.9 (published 2026-10-26)

Added, nothing breaks:

- **`Rest.disconnect(connectionId)`** (`DELETE /connection/{id}`, the right `disconnect`): closes
  one connection in every channel, for a backend or a bot that throws someone out of the app.
- **`disconnected(fn)`**: the server closed this connection with **4401** (the app disconnected
  it). It does not connect again by itself, as after 4403; `offline` is called first. With a server
  from before 2026-10-27 a disconnect closes plainly, and the client comes back as before.

## 1.0.0-rc.8 (published 2026-10-26)

Added, nothing breaks (for the server of 2026-10-26 and later):

- **`sendTo(member, event, data)`** on private, presence and encrypted channels: a client event to
  one member only, by connection id or `{ userId }` (the `user_id` in signed member data). A member
  not in the channel is refused with `refused("no_such_member")` (new `ErrorCode`).
- **What the server says about a message**: handlers get a last argument `info` (`MessageInfo`:
  `direct`, `userId`, `bot`) when there is something to say: a message to this member alone, or a
  client event whose sender has a user id or is a bot. Ordinary messages are handed over with the
  same arguments as before.
- **`Rest.publish(channel, event, data, { to | toUser })`** pushes to one member
  (`?to=` / `?to_user=`), and `publish` now resolves with how many connections it reached.
- **`Rest.channels({ prefix, info, limit, after })`** (`GET /channels`) and **`Rest.stats(channel)`**,
  with `message_count`.
- **Moderation**: `kick(member, { reason, banSeconds })` on private and presence channels, for a bot
  whose key has the `kick` right (`ban` with `banSeconds`) for the channel; `kicked(fn)` tells the
  removed member `{ reason, banSeconds }`, and the channel is then forgotten (not joined again on
  reconnect); `refused("banned")` for a join while banned (new `ErrorCode`).
  **`Rest.kick(channel, member, { reason, banSeconds })`**: `DELETE /{channel}/clients`. Types
  `KickOptions`, `KickInfo`. Needs the server of 2026-10-27 or later.

## 1.0.0-rc.7 (not published yet)

Breaking, for apps on rc.6 or earlier:

- **Client events are named `client-…`.** `send("typing")` sends `client-typing` (a name that already
  starts with `client-` is kept). Client events arrive under their `client-` name: listen with the new
  `onClient("typing", fn)` (the same as `on("client-typing", fn)`; `offClient` removes it).
  `on("typing", fn)` no longer gets members' events, so a member can never pass something off as an
  event your backend published. `clientMessage(fn)` gets the `client-` name. `Rest.publish` refuses
  names that start with `client-`.
- **Older clients can no longer send client events, nor `Rest` publish.** The server refuses a client
  event without the prefix (`invalid_event_name`) and a request token that is not bound to its
  request (401). Clients on rc.6 or earlier still connect, join and receive; update them to rc.7
  before the server, or as soon after as you can. An older client that listens with `on("typing")`
  does not get what rc.7 clients send (`client-typing`).
- **`send("")` throws** (and `send()` without a name; an encrypted channel's `send` rejects): a
  client event needs a name.
- **Request tokens are made for one request.** `requestToken(apiKey, appId, { method, url, body })`
  and `authorizationHeader(…)` take the request instead of a lifetime, and the token binds `htm`
  (method), `htu` (path and query as fetch sends them) and `bh` (SHA-256 of the body), with
  `exp = iat + 60`. `Rest.authorization()` takes the request too: `authorization({ method, url,
  body })`. `Rest` signs a new token for every request instead of reusing one for four minutes, and
  no longer tries again after a 401. `REQUEST_TOKEN_LIFETIME` (60) is exported.
- **The channel key of a `private-encrypted-` channel includes the app id**:
  `HMAC-SHA256(master key, "<app id>\n<channel>")`, so one master key used for two apps (staging
  and production) still gives each its own keys. `channelKey(masterKey, appId, channel)` takes the app id;
  `MasterKeyAuthenticator` gets it from `Pikoman`, and `Rest` uses its own `app`. Keys from rc.6 or
  earlier differ: a backend's token endpoint and its clients move to rc.7 together.
- **A backend's clock may be off by 60 s, not 300 s.** Tokens live 60 s instead of 300 s, so a
  backend whose clock is more than 60 s behind the server's makes tokens that have expired when
  they arrive, and can no longer publish (more than 60 s ahead was refused before too). Keep the
  clock in sync (NTP).

Also:

- Reconnecting waits a random time below 1 s, doubling up to 30 s while attempts fail (full jitter),
  instead of a fixed 5 s, and starts over from 1 s only once a connection has lasted 30 s: a server
  in a crash loop, or one that closes connections right after `connected` (1008, 4429), does not
  get every client back within a second each time. Never two sockets at once: a socket given up on
  is closed and its handlers removed, so an event can no longer arrive twice.
- `offline` is called once per lost connection. The connection is `Online` (`getStatus()`) from the
  server's `connected`, not from the socket opening, so a socket that opens and closes before
  `connected` does not call `offline` again. A page shown again from the back/forward cache is told
  `online`, or `offline` if connecting fails, as a new page would be.
- A callback that throws (`offline`, `online`, `revoked`, `on`, `refused`, …) stops neither the
  library nor the other callbacks: the library reconnects, or joins the channels again, before it
  tells the app, and the error is thrown again on its own from a timer, so it is reported as any
  uncaught error is.
- `htu` is the URL's `pathname + search`, exactly what Node's fetch sends: a lone `?` is left out.
- `Rest.publish` refuses empty channel and event names, and `.` and `..`, which the URL would read
  as steps in the path (`publish("..", "mass_events")` went out as `POST /mass_events`).
- `ErrorCode` has the server's new `data_too_large` (a client event's data over the cap) and
  `invalid_event_name` (a client event not named `client-…`).
- `pikoman.close()` closes for good: no reconnect, every timer stopped, the page listeners removed.
- **Names are checked before they go into a URL.** `HttpAuthenticator` refuses a channel name the
  server would not take, and a connection id that is not one, so a channel name taken from a URL
  parameter (`private-x/../../api/account/delete?`) can no longer send the token request with the
  visitor's cookies to another path on the backend. `new Pikoman(appId)` refuses an app id the
  server would not take.
- **No tokens in the clear by mistake.** `Rest` takes only `https://` (`http://` only to localhost),
  and outside a browser `ws_address` only `wss://` (`ws://` only to localhost), as the Rust crate.
- **`OfflineAuthenticator` with a signing key refuses a browser page** not served from localhost,
  since the key would be in the page; pass `{allowInBrowser: true}` as the fifth argument for a
  page that only tries things out with a key its visitor types in.
- A private channel no longer asks for a join token before the connection has its id, and does not
  send a join made for an old connection or a channel that was left meanwhile.
- The server's default cap on an event's data is now 12 KiB.

## 1.0.0-rc.6 (built, never published)

- A channel taken away with `key_revoked` joins again with a new token (1, 2, 4 s, then
  `refused("rejoin_failed")`); `rejoin_on_revoke: false` to handle it yourself.
- Close code 4403 (the API key was deleted) stays offline and calls `revoked(fn)`.
- `leave` sends one leave; the new error codes in `ErrorCode`.
