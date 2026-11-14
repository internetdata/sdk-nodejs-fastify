# Changelog

What each release changed for you, newest first. Each line is a commit's summary, linked to its full description and diff.

## 1.0.1 - 2026-11-14

### Fixes

- Require @internetdata/internetdata 2.10.1: a 403 can mean the key lacks the ip.lookup scope ([`6ebae0b`](https://github.com/internetdata/sdk-nodejs-fastify/commit/6ebae0b4fa86c6ff6ebf694d4860c9faae1f924c))

## 1.0.0 - 2026-11-14

### Features

- Decorate every request with the visitor's InternetData record as `request.internetdata`: the location, the network and the company behind the address, and the anonymity and hosting flags your plan serves ([`1c7f9ff`](https://github.com/internetdata/sdk-nodejs-fastify/commit/1c7f9ff606f3531eef7a9c22a979960a645f58e5))
- Refuse a request with a `blockCondition` written in the shape of a result, by country, network type, anonymity or any other member, with 403 or an awaited `onBlocked` of your own ([`1c7f9ff`](https://github.com/internetdata/sdk-nodejs-fastify/commit/1c7f9ff606f3531eef7a9c22a979960a645f58e5))
- Choose where the client address comes from: `request.ip` by default, `xffIpSelector`, `headerIpSelector` for a header your edge writes, or a function of your own ([`1c7f9ff`](https://github.com/internetdata/sdk-nodejs-fastify/commit/1c7f9ff606f3531eef7a9c22a979960a645f58e5))
- Fail open on any lookup failure unless `failClosed` is set, with a 2500 ms bound, no retry and a cache per registration by default ([`1c7f9ff`](https://github.com/internetdata/sdk-nodejs-fastify/commit/1c7f9ff606f3531eef7a9c22a979960a645f58e5))
