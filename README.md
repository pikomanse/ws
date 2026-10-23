# @pikoman/ws

The browser client for [Pikoman](https://pikoman.se), a hosted WebSocket service: public channels,
presence channels with a member list, and private channels.

**1.0 speaks protocol 2.0.** It needs an app from the [dashboard](https://pikoman.se/dashboard/) and
does not work with 1.x apps or servers. What changed: [Protocol 2.0](https://pikoman.se/docs/v2/).

```bash
npm install @pikoman/ws@next     # 1.0.0-rc: protocol 2.0
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

// Private: only for those your backend signs a token for.
pikoman.listenPrivate("private-user-123").on("notification", (data) => console.log(data));
```

Messages to a channel are published from your backend over HTTP, with the app's API key:

```bash
curl -u app-yourapp:$PIKOMAN_API_KEY -d '{"id": 1042}' https://next-api.pikoman.se/orders/order-shipped
```

## Join tokens

Your backend signs an EdDSA JWT with the app's private key, for one connection and one channel,
valid for at most 10 minutes. Examples for Node and PHP are on the
[Protocol 2.0](https://pikoman.se/docs/v2/) page. The private key never goes in frontend code.

## License

MIT
