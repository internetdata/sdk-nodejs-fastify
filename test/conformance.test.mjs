// The shared conformance corpus, asserted through a real Fastify server rather
// than against the core directly. The core has its own suite in the client
// SDK; what this adds is proof that the adapter wires it up - that a matching
// condition actually refuses the request and a plan gap actually surfaces.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, test } from 'node:test';

import Fastify from 'fastify';
import { InternetData } from '@internetdata/internetdata';

import { internetdata } from '../dist/index.js';

const data = JSON.parse(readFileSync(new URL('../testdata/testdata.json', import.meta.url), 'utf8'));
const servers = [];

after(async () => {
    for (const s of servers) {
        await s.close();
    }
});

// The corpus speaks the wire's names so every language can read it. Only the
// top-level members are renamed, exactly as a response is: the objects under
// them keep their wire keys in this SDK too, so a path such as `location.city`
// renames its first segment alone.
const camel = (name) => name.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
const idiomPath = (path) => path.replace(/^[^.]+/, camel);

function toIdiom(condition) {
    if (Array.isArray(condition)) {
        return condition.map(toIdiom);
    }
    return Object.fromEntries(Object.entries(condition).map(([k, v]) => [camel(k), v]));
}

async function serve(options) {
    const app = Fastify();
    await app.register(internetdata, options);
    app.get('/', async () => ({ ok: true }));
    await app.listen({ port: 0, host: '127.0.0.1' });
    servers.push(app);
    return `http://127.0.0.1:${app.server.address().port}/`;
}

for (const c of data.middleware.conditions) {
    test(`corpus: ${c.name}`, async () => {
        const ip = c.bogon ?? c.body.ip;
        const client = new InternetData({
            cache: false,
            retries: 0,
            fetch: async () => new Response(JSON.stringify(c.body ?? {}), {
                status: 200, headers: { 'content-type': 'application/json' },
            }),
        });
        const warnings = [];
        const url = await serve({
            client: client,
            ipSelector: () => ip,
            blockCondition: toIdiom(c.condition),
            onWarn: (m) => warnings.push(m),
        });
        const res = await fetch(url);

        assert.equal(res.status, c.expect.blocked ? 403 : 200, c.why);
        const missing = c.expect.missing.map(idiomPath);
        const reported = warnings.filter((w) => w.includes('does not include'));
        assert.equal(reported.length, missing.length === 0 ? 0 : 1, c.why);
        for (const member of missing) {
            assert.ok(reported[0].includes(member), `${c.why} (${member} not named in: ${reported[0]})`);
        }
    });
}

for (const c of data.middleware.invalidConditions) {
    test(`corpus: refuses ${c.name}`, () => {
        return assert.rejects(
            () => Fastify().register(internetdata, { blockCondition: toIdiom(c.condition) }).ready(),
            /constrains nothing/,
            c.why,
        );
    });
}

test('the corpus is the one emitted for this repo', () => {
    assert.ok(data.middleware.conditions.length > 0, 'no middleware corpus - run emit.mjs');
    assert.ok(data.isBogon.length > 0, 'no bogon corpus - run emit.mjs');
});
