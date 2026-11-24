# [<img src="https://s3.internetdata.io/internetdata-public/brand/mark.svg" alt="InternetData" height="28"/>](https://internetdata.io/) InternetData Fastify Plugin

[![npm](https://img.shields.io/npm/v/internetdata-fastify.svg)](https://www.npmjs.com/package/internetdata-fastify)
[![license](https://img.shields.io/npm/l/internetdata-fastify.svg)](LICENSE)

The official [Fastify](https://fastify.dev) plugin for the [InternetData](https://internetdata.io) API.

It looks up the visitor behind each request, where they are, which network they come from and whether it's a VPN, a proxy, Tor or a hosting server, and hands the answer to your handlers. Blocking is opt-in.

## Getting Started

```bash
npm install internetdata-fastify
```

Requires Node.js 22 or newer and Fastify 4 or 5. TypeScript types are included.

Without an API key a lookup is on Unlimited, the free plan: the country, the network and the company behind the address, Tor, relay, bot, anycast, carrier and satellite space and the service flags, with no daily or monthly cap. Every lookup your app makes comes from your server's one address, though, so a busy site will see bursts refused. A paid plan answers every field, VPN, the proxy flags, hosting, CDN and the city among them; create a key in the [console](https://app.internetdata.io). A free account tries every field.

```js
import Fastify from 'fastify';
import { internetdata } from 'internetdata-fastify';

// trustProxy names the proxy whose X-Forwarded-For Fastify believes; see
// "Where the client address comes from" below.
const app = Fastify({ trustProxy: 'loopback' });

await app.register(internetdata, { apiKey: process.env.INTERNETDATA_API_KEY });

app.get('/', async (request) => {
    const { result } = request.internetdata;
    return `Hello, visitor from ${result?.location.country_name ?? 'somewhere'}`;
});

await app.listen({ port: 3000 });
```

By default nothing is blocked. Every request gets a `request.internetdata` and your own code decides what it means: a currency to show, a sign-up to review, a page to keep from some countries.

## Blocking

Pass a `blockCondition` and a matching request is answered with `403` and never reaches your handlers.

```js
await app.register(internetdata, {
    apiKey: process.env.INTERNETDATA_API_KEY,
    blockCondition: { location: { country: ['CU', 'IR', 'KP'] } },
});
```

A condition is written in the shape of a result, and only the members you name are considered, so it can refuse on anything in the answer. The country works on every plan, and so do the first three of these:

```js
blockCondition: { asn: { type: 'hosting' } }                          // the network's type
blockCondition: [{ isAnycast: true }, { isSatellite: true }]          // anycast and satellite space
blockCondition: { isBot: true }                                       // crawlers, monitors and scanners
blockCondition: [{ isHosting: true }, { isCdn: true }]                // traffic from servers, not people
blockCondition: [{ isVpn: true }, { isTor: true }, { isResproxy: true }]  // anonymity: a list is OR
blockCondition: { isVpn: true, vpn: { provider: 'nordvpn' } }         // one provider
blockCondition: { resproxy: { hits: { gte: 5 } } }                    // a numeric threshold
```

Values are matched by equality, strings without regard to case. An array means any-of. `{ gte, gt, lte, lt }` compares numbers, and every bound you give must hold, so two of them are a range. A member the answer holds as a list matches when any one element does, every member of an object term on the same element: `{ web: { port: 443 } }`, `{ pubproxy: { protocols: 'socks5' } }`. Members you set to `false` or `null` are ignored, so a condition states the signals you act on; one that constrains nothing would match every request, and is refused when the plugin registers rather than silently blocking all your traffic.

Replace the refusal with `onBlocked`:

```js
await app.register(internetdata, {
    apiKey: process.env.INTERNETDATA_API_KEY,
    blockCondition: { location: { country: ['CU', 'IR', 'KP'] } },
    onBlocked: (request, reply) => reply.status(451).send({ error: 'not available in your country' }),
});
```

`onBlocked` may be async; it is awaited, so the route handler never runs.

## Where the client address comes from

This is the setting that decides whether any of the above works, and it is the one thing only you can get right.

By default the plugin uses `request.ip`, which is Fastify's own accessor. **Fastify resolves `request.ip` to the socket peer unless you built the server with `trustProxy`.** So if your app sits behind nginx, a load balancer, or a CDN and you have not set it, every visitor arrives wearing your proxy's address, and that is the address that gets looked up: every visitor gets your proxy's country and network, and if it is a hosting address, a hosting rule blocks everyone. nginx on the same machine is `127.0.0.1` and a load balancer usually has a private address, which the plugin answers locally without a lookup, as an address with no country, and logs a warning.

If you are behind a proxy you control, setting Fastify's own option to that proxy's address is the right fix and everything else here follows from it:

```js
const app = Fastify({ trustProxy: 'loopback' });    // a proxy on the same machine, over 127.0.0.1 or ::1
const app = Fastify({ trustProxy: '10.0.0.0/8' });  // or your load balancer's subnet
```

Name your proxies rather than setting `true`. With `true`, `request.ip` is the left-most `X-Forwarded-For` entry, and the visitor writes that one: nginx, AWS's Application Load Balancer and Cloudflare all append to the header rather than replace it, so a visitor who sends `X-Forwarded-For: 1.1.1.1` is looked up as `1.1.1.1`. Keep `true` only behind an edge you control that overwrites `X-Forwarded-For`.

For an edge that writes the address into its own header, name the header:

```js
import { headerIpSelector } from 'internetdata-fastify';

await app.register(internetdata, {
    apiKey: process.env.INTERNETDATA_API_KEY,
    ipSelector: headerIpSelector('CF-Connecting-IP'),  // or True-Client-IP, or your own
});
```

`xffIpSelector()` reads `X-Forwarded-For` directly. Be aware that the left-most entry is whatever the caller sent, because proxies append to that header, so it's only trustworthy when an edge you control overwrites it. If you know how many proxies sit in front, count from the right instead: `xffIpSelector({ depth: 1 })` is the address your nearest proxy saw.

Anything else, pass your own function. It receives the Fastify request and returns an address:

```js
ipSelector: (request) => request.headers['x-real-ip'] ?? request.ip,
```

If the address resolves to a private one, the plugin says so once on `console.warn`. That is expected on localhost and is the signal to fix your configuration anywhere else.

## When a lookup fails

The request is let through, and the reason is recorded on `request.internetdata.error`. Our outage should not become yours, so a network failure, a rate limit or a rejected key all fail open.

```js
app.get('/', async (request) => {
    const { result, error } = request.internetdata;
    if (error) {
        request.log.warn({ kind: error.kind }, 'internetdata unavailable');
    }
    return `Hello, visitor from ${result?.location.country_name ?? 'somewhere'}`;
});
```

Pass `failClosed: true` to block instead. Private addresses are answered locally and never fail, so this will not lock you out in development.

## Cost and latency

Answers are cached per plugin registration for an hour, so a returning visitor costs nothing, and private addresses never leave the process. A cache miss is one request to our API, bounded at 2500 ms by default and not retried: on a request path, failing open quickly beats holding a visitor while we try again. Both are adjustable, along with the cache itself:

```js
await app.register(internetdata, {
    apiKey: KEY, timeoutMs: 1000, retries: 1, cache: { max: 50000, ttlMs: 600000 },
});
```

Register it inside a scope to confine it to those routes, or skip what you do not care about:

```js
await app.register(async (scope) => {
    await scope.register(internetdata, { apiKey: KEY });
    scope.get('/checkout', handler);
});

await app.register(internetdata, {
    apiKey: KEY, skip: (request) => request.url.startsWith('/static'),
});
```

If you already hold an `InternetData` client, pass it as `client` and the plugin will share it rather than building a second cache.

A registration nested in a scope that already has one runs after it, and its answer replaces the outer one on the routes it covers. Give both the same client and the second lookup is a cache hit, so this attaches the answer on every account route and blocks only at checkout, for one request per visitor:

```js
const client = new InternetData({ apiKey: KEY });  // from '@internetdata/internetdata'

await app.register(async (account) => {
    await account.register(internetdata, { client });
    account.post('/signup', signupHandler);

    await account.register(async (checkout) => {
        await checkout.register(internetdata, { client, blockCondition: { location: { country: ['CU', 'IR', 'KP'] } } });
        checkout.post('/checkout', checkoutHandler);
    });
});
```

Beyond a few million distinct visitors a day, stop calling the API per request: look addresses up locally in [our databases](https://internetdata.io/databases) instead.

## Absent is not false

Unlimited, with a key or without one, leaves out `isVpn`, `isHosting`, `isCdn` and the four proxy flags, the detail behind them, and the paid members inside `location`, `asn`, `company` and `abuse`, such as `location.city`. A field your plan does not include is `undefined`, which means "not in your plan" rather than "checked, and no".

```js
request.internetdata.result?.isVpn ?? false   // when you only want the flag
```

A `blockCondition` naming a member your plan does not serve, `location.city` on Unlimited included, can never match, so the plugin warns once instead of failing silently. Set `onMissingField: 'throw'` to make it an error.

## Other Libraries

There are official InternetData client libraries available for many languages including PHP, Python, Go, Java, and Ruby. See our GitHub at https://github.com/internetdata for more.

## About InternetData

Geolocation, anonymity, ownership and network data for IP addresses, AS numbers and domains, as an API and as databases you download and query yourself.

[<img src="https://s3.internetdata.io/internetdata-public/brand/mark.svg" alt="InternetData" height="64"/>](https://internetdata.io/)

## License

This project is licensed under the [MIT License](LICENSE).
