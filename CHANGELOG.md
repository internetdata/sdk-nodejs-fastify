# Changelog

What each release changed for you, newest first. Each line is a commit's summary, linked to its full description and diff.

## 1.0.11 - 2026-11-24

### Features

- Require @internetdata/internetdata 2.17.0: a condition on a list member matches any element ([`82a93fa`](https://github.com/internetdata/sdk-nodejs-fastify/commit/82a93fa3ceaeabf3a631133581ad981a1f301008))

## 1.0.10 - 2026-11-23

### Fixes

- Require internetdata 2.16.1 ([`291c26e`](https://github.com/internetdata/sdk-nodejs-fastify/commit/291c26e71ca775f26af6a7d21c06144786958277))

## 1.0.9 - 2026-11-22

### Features

- Require internetdata 2.16.0: block on isBot, and read a paid answer's bot ([`1bc2a37`](https://github.com/internetdata/sdk-nodejs-fastify/commit/1bc2a37db27acc31a08ef1a06e37b5fc54aa54bd))
- README: block crawlers, monitors and scanners with isBot, on every plan ([`5fdd050`](https://github.com/internetdata/sdk-nodejs-fastify/commit/5fdd050b474996376c5d5d3417c35b7486799995))

## 1.0.8 - 2026-11-20

### Fixes

- Require internetdata 2.15.0: a paid domain answer's hosting, home page and linking domains ([`33fc14b`](https://github.com/internetdata/sdk-nodejs-fastify/commit/33fc14b1b670db0a83f08c5f76887d98b213bf64))

## 1.0.7 - 2026-11-20

### Fixes

- Require internetdata 2.14.2: the spec re-pinned to 2026.11.20 ([`e6ba468`](https://github.com/internetdata/sdk-nodejs-fastify/commit/e6ba468d29818006d097856bfd82c02efe462560))

## 1.0.6 - 2026-11-19

### Fixes

- Require internetdata 2.14.1: a reduced answer is cached a minute at most ([`dd4759c`](https://github.com/internetdata/sdk-nodejs-fastify/commit/dd4759cb3ef14f98465f353c49e64ec35c75e719))

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
