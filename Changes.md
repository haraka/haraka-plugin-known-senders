
#### N.N.N - YYYY-MM-DD


### [1.0.10] - 2023-12-12

- style(es6): replace for i with for...of
- ci(publish): only when package.json modified
- ci: test on node 18 & 20


#### 1.0.9 - 2022-05-28

- restore a plugin = this, context demands it
- add .release submodule


### 1.0.8 - 2022-05-24

- feat(redis): compatibility with redis 4
- dep(eslint): 4 -> 8
- dep(pi-redis): * -> 2
- ci: replace travis/appveyor with GHA
- lint: prefer-template
- doc(README): badge updates
- style: plugin -> this


### 1.0.7 - 2019-03-16

- assure already_matched has 'this' in context.
- add some es6 interpoled strings


### 1.0.6 - 2018-12-06

- move declarations up to restore `var` variable hoisting behavior


### 1.0.5 - 2018-11-16

- reduce severity of log message when no passing dkim results


### 1.0.4 - 2018-11-16

- quit redis conn after last test
- add skeleton support for TLS validation
- travis: remove node 4, add node 8 CI testing


### 1.0.3 - 2016-02-06

- inherit redis config from redis.ini
- add tests for get_recipient_domains_by_txn


### 1.0.2 - 2016-02-06

- inherit from haraka-plugin-redis (vs redis)
[1.0.10]: https://github.com/haraka/haraka-plugin-known-senders/releases/tag/1.0.10
