// The published package, registered on a real Fastify server, against the live API:
// keyless on prod and staging, and on staging with the CI key.
//
// The unit suite stubs the transport, so it proves the wiring and nothing about
// the artifact a stranger installs: a `files` list shipping no `dist`, an
// export map a consumer cannot resolve, or a release that never landed all pass
// it. It also cannot prove that the API key reaches the wire, because a stub
// answers the same either way.

import assert from 'node:assert/strict';
import { after, test } from 'node:test';

import Fastify from 'fastify';
import { internetdata } from 'internetdata-fastify';

import { skipForNoKey, stagingKey } from '../lib/key.mjs';

const STAGING_API = 'https://api-staging.internetdata.io';

// A stable hosting address, sent as the client address through a selector
// rather than by spoofing a header, so the test is about the lookup rather than
// about trust-proxy configuration.
const PROBE = '146.70.116.130';

const servers = [];

after(async () => {
    for (const s of servers) {
        await s.close();
    }
});

async function serve(options) {
    const app = Fastify();
    await app.register(internetdata, { ipSelector: () => PROBE, ...options });
    app.get('/', async (request) => ({
        ip: request.internetdata?.ip ?? null,
        error: request.internetdata?.error?.kind ?? null,
        country: request.internetdata?.result?.location.country ?? null,
        members: Object.keys(request.internetdata?.result?.raw ?? {}).sort(),
    }));
    await app.listen({ port: 0, host: '127.0.0.1' });
    servers.push(app);
    const url = `http://127.0.0.1:${app.server.address().port}/`;
    return async () => {
        const res = await fetch(url);
        return { status: res.status, body: await res.json().catch(() => null) };
    };
}

for (const [env, baseUrl] of [['prod', undefined], ['staging', STAGING_API]]) {
    const where = baseUrl === undefined ? {} : { baseUrl: baseUrl };

    test(`${env}: a keyless lookup is attached to the request, and blocks on its country`, async () => {
        const enrich = await serve(where);
        const res = await enrich();
        assert.equal(res.status, 200, 'enrichment alone must never refuse a request');
        assert.equal(res.body.error, null, `lookup failed: ${res.body.error}`);
        assert.equal(res.body.ip, PROBE);
        assert.match(res.body.country, /^[A-Z]{2}$/);
        assert.ok(res.body.members.includes('location'), 'location is on every plan');
        assert.ok(!res.body.members.includes('is_vpn'), 'is_vpn is paid, so absent without a key');

        const country = res.body.country;
        const blocking = await serve({ ...where, blockCondition: { location: { country: country } } });
        assert.equal((await blocking()).status, 403, `a condition on ${country} must refuse it`);

        const other = country === 'AT' ? 'DE' : 'AT';
        const passing = await serve({ ...where, blockCondition: { location: { country: other } } });
        assert.equal((await passing()).status, 200, `a condition on ${other} must not refuse ${country}`);
    });
}

// The CI key's organization is on the free plan, so its answer carries
// trial_expired, which no keyless answer does: the key reached the wire.
test('staging: the CI key reaches the wire', { skip: skipForNoKey() }, async () => {
    const keyed = await serve({ baseUrl: STAGING_API, apiKey: stagingKey() });
    const res = await keyed();
    assert.equal(res.status, 200);
    assert.equal(res.body.error, null, `lookup failed: ${res.body.error}`);
    assert.ok(res.body.members.includes('trial_expired'), 'the answer is a keyless one');
});

test('an unreachable API fails open', async () => {
    // A reserved name that resolves to nothing, so this exercises a transport
    // failure rather than an error response.
    const call = await serve({
        baseUrl: 'https://api.invalid.internetdata.example',
        blockCondition: { location: { country: 'AT' } },
        timeoutMs: 2000,
    });
    const res = await call();
    assert.equal(res.status, 200, 'an outage of ours must not take the customer down');
    assert.ok(res.body.error !== null, 'and the reason must be on the request');
});
