// The plugin, against a real Fastify server on a real socket. The shared
// conformance corpus is asserted in conformance.test.mjs.
//
// A test server answers on the loopback, so `request.ip` is a bogon and is
// answered locally without a request. Anything that needs a served answer
// therefore has to arrive wearing a public address - through `trustProxy`, or a
// selector.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import { after, test } from 'node:test';
import os from 'node:os';

import Fastify from 'fastify';
import { InternetData } from '@internetdata/internetdata';

import {
    defaultIpSelector, headerIpSelector, internetdata, xffIpSelector,
} from '../dist/index.js';

const data = JSON.parse(readFileSync(new URL('../testdata/testdata.json', import.meta.url), 'utf8'));
// Served answers from the lookup corpus: Unlimited's, and a paid plan's.
const UNLIMITED = data.lookup.find((c) => c.name === 'unlimited-answer').body;
const PAID = data.lookup.find((c) => c.name === 'paid-full-shape').body;
const PUBLIC_IP = PAID.ip;
const servers = [];

after(async () => {
    for (const s of servers) {
        await s.close();
    }
});

function stubClient(body = PAID) {
    const asked = [];
    const client = new InternetData({
        cache: false,
        retries: 0,
        fetch: async (input) => {
            const url = new URL(typeof input === 'string' ? input : input.url);
            const ip = decodeURIComponent(url.pathname.slice(1));
            asked.push(ip);
            return new Response(JSON.stringify({ ...body, ip: ip }), {
                status: 200, headers: { 'content-type': 'application/json' },
            });
        },
    });
    return { client: client, asked: asked };
}

async function serve(options, fastifyOptions = {}) {
    const app = Fastify(fastifyOptions);
    await app.register(internetdata, options);
    app.get('/', async (request) => ({
        ip: request.internetdata?.ip ?? null,
        country: request.internetdata?.result?.location.country ?? null,
        isVpn: request.internetdata?.result?.isVpn ?? null,
        isBogon: request.internetdata?.result?.isBogon ?? null,
        error: request.internetdata?.error?.kind ?? null,
        attached: request.internetdata !== undefined,
    }));
    await app.listen({ port: 0, host: '127.0.0.1' });
    servers.push(app);
    const base = `http://127.0.0.1:${app.server.address().port}`;
    return async (headers = {}) => {
        const res = await fetch(`${base}/`, { headers: headers });
        return { status: res.status, body: await res.json().catch(() => null) };
    };
}

const fixedIp = () => PUBLIC_IP;

test('enriches the request and leaves the decision to the app', async () => {
    const { client: client, asked: asked } = stubClient(UNLIMITED);
    const call = await serve({ client: client, ipSelector: fixedIp });
    const res = await call();
    assert.equal(res.status, 200);
    assert.equal(res.body.attached, true);
    assert.equal(res.body.country, 'AT');
    assert.equal(res.body.isVpn, null, 'Unlimited leaves is_vpn out, and absent is not false');
    assert.equal(res.body.ip, PUBLIC_IP);
    assert.deepEqual(asked, [PUBLIC_IP]);
});

test('blocks with 403 on a country condition, and passes another country', async () => {
    const blocked = await serve({
        client: stubClient(UNLIMITED).client, ipSelector: fixedIp,
        blockCondition: { location: { country: ['DE', 'AT'] } },
    });
    const denied = await blocked();
    assert.equal(denied.status, 403);
    assert.deepEqual(denied.body, { error: 'access denied' });

    const allowed = await serve({
        client: stubClient(UNLIMITED).client, ipSelector: fixedIp,
        blockCondition: { location: { country: 'DE' } },
    });
    assert.equal((await allowed()).status, 200);
});

test('blocks on a network type, and on anonymity, and passes a clean answer', async () => {
    const hosting = await serve({
        client: stubClient(UNLIMITED).client, ipSelector: fixedIp,
        blockCondition: { asn: { type: 'hosting' } },
    });
    assert.equal((await hosting()).status, 403);

    const anonymous = await serve({
        client: stubClient(PAID).client, ipSelector: fixedIp,
        blockCondition: [{ isTor: true }, { isVpn: true }],
    });
    assert.equal((await anonymous()).status, 403);

    const passing = await serve({
        client: stubClient({ ...PAID, is_vpn: false, vpn: {} }).client, ipSelector: fixedIp,
        blockCondition: [{ isTor: true }, { isVpn: true }],
    });
    assert.equal((await passing()).status, 200);
});

// Every answer carries `is_bot`, on every plan, so a condition on it blocks a
// crawler's public address and passes any other visitor's.
test('blocks a bot on isBot from its public address, and passes another visitor', async () => {
    const bot = data.lookup.find((c) => c.name === 'paid-bot').body;
    const { client: client, asked: asked } = stubClient(bot);
    const blocked = await serve({
        client: client, ipSelector: () => bot.ip, blockCondition: { isBot: true },
    });
    assert.equal((await blocked()).status, 403);
    assert.deepEqual(asked, [bot.ip]);

    const passing = await serve({
        client: stubClient(UNLIMITED).client, ipSelector: fixedIp, blockCondition: { isBot: true },
    });
    assert.equal((await passing()).status, 200);
});

test('a blocked request never reaches the handler', async () => {
    const { client: client } = stubClient();
    const call = await serve({
        client: client, ipSelector: fixedIp, blockCondition: { isVpn: true },
    });
    const res = await call();
    assert.equal(res.status, 403);
    assert.equal(res.body.attached, undefined, 'the route handler answered a blocked request');
});

// The case where awaiting onBlocked is load-bearing. A synchronous
// `reply.send()` ends the lifecycle on its own, so the default refusal passes
// whether or not the hook awaits - which is why that alone proves nothing. An
// async one has sent nothing by the time an un-awaited hook resolves, and
// Fastify goes on to the handler.
test('an async onBlocked is awaited, so the handler still never runs', async () => {
    const { client: client } = stubClient();
    const call = await serve({
        client: client,
        ipSelector: fixedIp,
        blockCondition: { isVpn: true },
        onBlocked: async (request, reply) => {
            await new Promise((r) => setTimeout(r, 25));
            return reply.status(451).send({ refused: true });
        },
    });
    const res = await call();
    assert.equal(res.status, 451);
    assert.deepEqual(res.body, { refused: true });
});

test('a condition reaching the evidence fields is what a flag list cannot do', async () => {
    const mullvad = stubClient(PAID);
    const call = await serve({
        client: mullvad.client, ipSelector: fixedIp, blockCondition: { vpn: { provider: 'nordvpn' } },
    });
    assert.equal((await call()).status, 200, 'a different provider must not match');

    const call2 = await serve({
        client: mullvad.client, ipSelector: fixedIp,
        blockCondition: { vpn: { provider: 'mullvad' } },
    });
    assert.equal((await call2()).status, 403);
});

test('onBlocked replaces the refusal entirely', async () => {
    const { client: client } = stubClient();
    const call = await serve({
        client: client,
        ipSelector: fixedIp,
        blockCondition: { isVpn: true },
        onBlocked: (request, reply, lookup) => reply.status(451)
            .send({ why: lookup.result.vpn.provider }),
    });
    const res = await call();
    assert.equal(res.status, 451);
    assert.deepEqual(res.body, { why: 'mullvad' });
});

test('skip leaves the request untouched', async () => {
    const { client: client, asked: asked } = stubClient();
    const call = await serve({
        client: client, ipSelector: fixedIp, blockCondition: { isVpn: true },
        skip: (request) => request.url === '/',
    });
    const res = await call();
    assert.equal(res.status, 200);
    assert.equal(res.body.attached, false);
    assert.deepEqual(asked, []);
});

test('a failing lookup lets the visitor through', async () => {
    const failing = new InternetData({
        retries: 0,
        fetch: async () => new Response('{"error":"boom"}', { status: 500 }),
    });
    const call = await serve({
        client: failing, ipSelector: fixedIp, blockCondition: { isVpn: true },
    });
    const res = await call();
    assert.equal(res.status, 200);
    assert.equal(res.body.error, 'server_error');
});

test('onMissingField: throw becomes a 500 rather than a silent pass', async () => {
    const free = stubClient(UNLIMITED);
    const call = await serve({
        client: free.client, ipSelector: fixedIp,
        blockCondition: { location: { city: 'Vienna' } }, onMissingField: 'throw',
    });
    assert.equal((await call()).status, 500);
});

// The test that matters. Every other assertion here would pass whether or not
// the selector is right, because a direct connection has nothing to confuse.
test('a forged X-Forwarded-For is ignored by default and honoured only on request', async () => {
    const forgery = { 'x-forwarded-for': PUBLIC_IP };

    const plain = stubClient();
    const untrusting = await serve({ client: plain.client });
    const direct = await untrusting(forgery);
    assert.equal(direct.body.ip, '127.0.0.1',
        'without trustProxy, request.ip is the socket peer and the header is a forgery');
    assert.deepEqual(plain.asked, [], 'and a bogon is answered locally, so nothing was asked');

    const trusting = stubClient();
    const trusted = await serve({ client: trusting.client }, { trustProxy: true });
    assert.equal((await trusted(forgery)).body.ip, PUBLIC_IP,
        'trustProxy is the application saying it believes the header');
    assert.deepEqual(trusting.asked, [PUBLIC_IP]);

    const explicit = stubClient();
    const viaSelector = await serve({ client: explicit.client, ipSelector: xffIpSelector() });
    assert.equal((await viaSelector(forgery)).body.ip, PUBLIC_IP);
    assert.deepEqual(explicit.asked, [PUBLIC_IP]);
});

test('a header selector reads the edge that writes it', async () => {
    const { client: client, asked: asked } = stubClient();
    const call = await serve({
        client: client, ipSelector: headerIpSelector('CF-Connecting-IP'),
    });
    assert.equal((await call({ 'cf-connecting-ip': '45.83.91.9' })).body.ip, '45.83.91.9');
    assert.equal((await call({})).body.ip, '127.0.0.1',
        'and falls back to request.ip when the edge did not write one');
    assert.deepEqual(asked, ['45.83.91.9']);
});

test('depth counts trusted hops from the right', async () => {
    const { client: client, asked: asked } = stubClient();
    const call = await serve({ client: client, ipSelector: xffIpSelector({ depth: 1 }) });
    await call({ 'x-forwarded-for': `${PUBLIC_IP}, 70.41.3.18, 150.172.238.178` });
    assert.deepEqual(asked, ['150.172.238.178']);
});

test('the default selector is request.ip', async () => {
    const { client: client } = stubClient();
    const call = await serve({ client: client, ipSelector: defaultIpSelector });
    assert.equal((await call()).body.ip, '127.0.0.1');
});

test('a private client address is answered locally and never blocks', async () => {
    const { client: client, asked: asked } = stubClient();
    const warnings = [];
    const call = await serve({
        client: client, blockCondition: { isVpn: true }, onWarn: (m) => warnings.push(m),
    });
    const res = await call();
    assert.equal(res.status, 200, 'local development must not lock you out of your own app');
    assert.equal(res.body.isBogon, true);
    assert.deepEqual(asked, []);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /not a public address/);
});

test('the deadline bounds the request rather than the visitor waiting on us', async () => {
    const hung = new InternetData({ retries: 0, fetch: () => new Promise(() => {}) });
    const call = await serve({
        client: hung, ipSelector: fixedIp, timeoutMs: 150, blockCondition: { isVpn: true },
    });
    const started = Date.now();
    const res = await call();
    assert.equal(res.status, 200);
    assert.equal(res.body.error, 'network');
    assert.ok(Date.now() - started < 3000, 'the visitor was held past the budget');
});

// fastify-plugin is what stops Fastify wrapping this in a child scope, where
// the decorator and the hook would apply to nothing the app registered.
test('the plugin applies to the instance it is registered on', async () => {
    const { client: client } = stubClient();
    const call = await serve({ client: client, ipSelector: fixedIp });
    assert.equal((await call()).body.attached, true);
});

// A child scope inherits its parent's request decorators, so decorating again
// in one stopped the app at startup with FST_ERR_DEC_ALREADY_PRESENT. The
// shape is the natural one for "flag every account route, block at checkout".
test('a registration nested inside one blocks its own routes and leaves the outer ones flagged', async () => {
    const asked = [];
    const client = new InternetData({
        retries: 0,
        fetch: async (input) => {
            const url = new URL(typeof input === 'string' ? input : input.url);
            const ip = decodeURIComponent(url.pathname.slice(1));
            asked.push(ip);
            return new Response(JSON.stringify({ ...PAID, ip: ip }), {
                status: 200, headers: { 'content-type': 'application/json' },
            });
        },
    });
    const app = Fastify();
    await app.register(async (account) => {
        await account.register(internetdata, { client: client, ipSelector: fixedIp });
        account.get('/signup', async (request) => ({ isVpn: request.internetdata.result.isVpn }));

        await account.register(async (checkout) => {
            await checkout.register(internetdata, {
                client: client, ipSelector: fixedIp, blockCondition: { isVpn: true },
            });
            checkout.get('/checkout', async () => ({ ordered: true }));
        });
    });
    await app.listen({ port: 0, host: '127.0.0.1' });
    servers.push(app);
    const base = `http://127.0.0.1:${app.server.address().port}`;

    const signup = await fetch(`${base}/signup`);
    assert.equal(signup.status, 200, 'the outer registration only flags');
    assert.deepEqual(await signup.json(), { isVpn: true });

    const checkout = await fetch(`${base}/checkout`);
    assert.equal(checkout.status, 403, 'the nested registration blocks');
    assert.deepEqual(await checkout.json(), { error: 'access denied' });
    assert.deepEqual(asked, [PUBLIC_IP], 'a shared client asks once per visitor across both');
});

// The README's same-machine setting. A proxy reaching the app over ::1 is not
// trusted under '127.0.0.1', so its visitors were answered locally as private.
const hasIpv6Loopback = Object.values(os.networkInterfaces()).flat()
    .some((i) => i.internal && i.family === 'IPv6' && i.address === '::1');

for (const host of ['127.0.0.1', '::1']) {
    test(`trustProxy: 'loopback' believes a proxy on ${host}`, { skip: host === '::1' && !hasIpv6Loopback }, async () => {
        const { client: client, asked: asked } = stubClient();
        const app = Fastify({ trustProxy: 'loopback' });
        await app.register(internetdata, { client: client });
        app.get('/', async (request) => ({ ip: request.internetdata.ip }));
        await app.listen({ port: 0, host: host });
        servers.push(app);
        const origin = host.includes(':') ? `[${host}]` : host;
        const res = await fetch(`http://${origin}:${app.server.address().port}/`, {
            headers: { 'x-forwarded-for': `1.1.1.1, ${PUBLIC_IP}` },
        });
        assert.deepEqual(await res.json(), { ip: PUBLIC_IP });
        assert.deepEqual(asked, [PUBLIC_IP]);
    });
}

test('a condition that constrains nothing is refused when the plugin registers', async () => {
    const app = Fastify();
    await assert.rejects(
        () => app.register(internetdata, { blockCondition: { isVpn: false } }).ready(),
        /constrains nothing/,
    );
    await app.close();
});

// Built exactly as the README builds it: the README's `trustProxy`, and an API key
// from the environment and nothing else. Every other test passes a client, so none
// could see the plugin fail to register, or send no key, the README's way.
test('builds as the README does, with the key set and unset', async () => {
    const realFetch = globalThis.fetch;
    const savedKey = process.env.INTERNETDATA_API_KEY;
    const sent = [];
    globalThis.fetch = async (input, init) => {
        const request = new Request(input, init);
        if (new URL(request.url).hostname !== 'api.internetdata.io') {
            return realFetch(input, init);
        }
        sent.push({ path: new URL(request.url).pathname, auth: request.headers.get('authorization') });
        return new Response(JSON.stringify(UNLIMITED), {
            status: 200, headers: { 'content-type': 'application/json' },
        });
    };
    try {
        for (const key of ['readme-key', undefined]) {
            if (key === undefined) {
                delete process.env.INTERNETDATA_API_KEY;
            } else {
                process.env.INTERNETDATA_API_KEY = key;
            }
            sent.length = 0;

            const app = Fastify({ trustProxy: 'loopback' });
            await app.register(internetdata, { apiKey: process.env.INTERNETDATA_API_KEY });
            app.get('/', async (request) => {
                const { result } = request.internetdata;
                return `Hello, visitor from ${result?.location.country_name ?? 'somewhere'}`;
            });
            await app.listen({ port: 0, host: '127.0.0.1' });
            servers.push(app);

            const res = await realFetch(`http://127.0.0.1:${app.server.address().port}/`, {
                headers: { 'x-forwarded-for': PUBLIC_IP },
            });
            assert.equal(res.status, 200, `key ${key}`);
            assert.equal(await res.text(), 'Hello, visitor from Austria', `key ${key}`);
            assert.deepEqual(sent, [{ path: `/${PUBLIC_IP}`, auth: key === undefined ? null : `Bearer ${key}` }]);
        }
    } finally {
        globalThis.fetch = realFetch;
        if (savedKey === undefined) {
            delete process.env.INTERNETDATA_API_KEY;
        } else {
            process.env.INTERNETDATA_API_KEY = savedKey;
        }
    }
});

// allowBots as the README builds it, behind `trustProxy` with a public visitor:
// the agent that reaches the API is the visitor's own, a verified crawler passes
// the condition it meets, a spoofed or not_bot one is refused, and off sends none.
// Requests go over a real socket with node:http, which sends no User-Agent of its
// own, where `inject` sends `lightMyRequest`.
test('allowBots sends the visitor\'s User-Agent and lets only a verified crawler through', async () => {
    const realFetch = globalThis.fetch;
    const googlebot = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
    const sent = [];
    let verdict = 'verified';
    globalThis.fetch = async (input, init) => {
        const request = new Request(input, init);
        const url = new URL(request.url);
        if (url.hostname !== 'api.internetdata.io') {
            return realFetch(input, init);
        }
        const agent = url.searchParams.get('user_agent');
        sent.push({ path: url.pathname, agent: agent });
        return new Response(JSON.stringify({
            ...PAID, ip: PUBLIC_IP, is_bot: true,
            ...(agent === null ? {} : { user_agent: { agent: 'Googlebot', kind: 'bot', verdict: verdict } }),
        }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const start = async (options) => {
        const app = Fastify({ trustProxy: 'loopback' });
        await app.register(internetdata, { apiKey: 'readme-key', cache: false, onWarn: () => {}, ...options });
        app.get('/', async (request) => ({ verdict: request.internetdata.result.userAgent?.verdict ?? null }));
        await app.listen({ port: 0, host: '127.0.0.1' });
        servers.push(app);
        return app.server.address().port;
    };
    const get = (port, headers) => new Promise((resolve, reject) => {
        http.get({ host: '127.0.0.1', port: port, path: '/', headers: { 'x-forwarded-for': PUBLIC_IP, ...headers } },
            (res) => {
                res.resume();
                res.on('end', () => resolve(res.statusCode));
            }).on('error', reject);
    });
    try {
        const on = await start({ blockCondition: { isBot: true }, allowBots: true });
        for (const [v, status] of [['verified', 200], ['spoofed', 403], ['not_bot', 403], ['unverifiable', 403]]) {
            verdict = v;
            sent.length = 0;
            assert.equal(await get(on, { 'user-agent': googlebot }), status, v);
            assert.deepEqual(sent, [{ path: `/${PUBLIC_IP}`, agent: googlebot }], `${v}: the visitor's own agent arrived`);
        }
        verdict = 'verified';
        for (const headers of [{}, { 'user-agent': '' }]) {
            sent.length = 0;
            assert.equal(await get(on, headers), 403, JSON.stringify(headers));
            assert.deepEqual(sent, [{ path: `/${PUBLIC_IP}`, agent: null }], `${JSON.stringify(headers)} sends none`);
        }
        const off = await start({ blockCondition: { isBot: true } });
        sent.length = 0;
        assert.equal(await get(off, { 'user-agent': googlebot }), 403);
        assert.deepEqual(sent, [{ path: `/${PUBLIC_IP}`, agent: null }], 'off sends none');
        const forged = await start({ blockCondition: { userAgent: { verdict: 'spoofed' } }, allowBots: true });
        verdict = 'spoofed';
        assert.equal(await get(forged, { 'user-agent': googlebot }), 403);
        verdict = 'verified';
        assert.equal(await get(forged, { 'user-agent': googlebot }), 200);
    } finally {
        globalThis.fetch = realFetch;
    }
});
