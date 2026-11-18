# Changelog

What each release changed for you, newest first. Each line is a commit's summary, linked to its full description and diff.

## 1.0.5 - 2026-11-18

### Fixes

- Require internetdata 2.14.0: every request names the SDK ([`feb57e4`](https://github.com/internetdata/sdk-nodejs-fastify/commit/feb57e45252c8eecb31ff817b5da0016fab30b30))

## 1.0.4 - 2026-11-17

### Features

- Require internetdata 2.13.0: cap_reached on a paid answer past its overage cap ([`3b6fff4`](https://github.com/internetdata/sdk-nodejs-fastify/commit/3b6fff4360775b558364804df947c38695fe3081))

## 1.0.3 - 2026-11-16

### Features

- Require internetdata 2.12.0: an AS's rank, neighbors and hosted domains ([`c011d98`](https://github.com/internetdata/sdk-nodejs-fastify/commit/c011d98c5c864741a9e009d955544de56a7f7174))

## 1.0.2 - 2026-11-15

### Features

- Require internetdata 2.11.0: hosted_domains lists its 10 most popular domains ([`4124ac9`](https://github.com/internetdata/sdk-nodejs-fastify/commit/4124ac9c89b4d6fe6b8b093881cf5084c97267c2))

## 1.0.1 - 2026-11-14

### Fixes

- Require @internetdata/internetdata 2.10.1: a 403 can mean the key lacks the ip.lookup scope ([`6ebae0b`](https://github.com/internetdata/sdk-nodejs-fastify/commit/6ebae0b4fa86c6ff6ebf694d4860c9faae1f924c))

## 1.0.0 - 2026-11-14

### Features

- Decorate every request with the visitor's InternetData record as `request.internetdata`: the location, the network and the company behind the address, and the anonymity and hosting flags your plan serves ([`1c7f9ff`](https://github.com/internetdata/sdk-nodejs-fastify/commit/1c7f9ff606f3531eef7a9c22a979960a645f58e5))
- Refuse a request with a `blockCondition` written in the shape of a result, by country, network type, anonymity or any other member, with 403 or an awaited `onBlocked` of your own ([`1c7f9ff`](https://github.com/internetdata/sdk-nodejs-fastify/commit/1c7f9ff606f3531eef7a9c22a979960a645f58e5))
- Choose where the client address comes from: `request.ip` by default, `xffIpSelector`, `headerIpSelector` for a header your edge writes, or a function of your own ([`1c7f9ff`](https://github.com/internetdata/sdk-nodejs-fastify/commit/1c7f9ff606f3531eef7a9c22a979960a645f58e5))
- Fail open on any lookup failure unless `failClosed` is set, with a 2500 ms bound, no retry and a cache per registration by default ([`1c7f9ff`](https://github.com/internetdata/sdk-nodejs-fastify/commit/1c7f9ff606f3531eef7a9c22a979960a645f58e5))
