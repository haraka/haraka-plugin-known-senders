
# 1.0.7 - 2019-03-16

- assure already_matched has 'this' in context.
- add some es6 interpoled strings

# 1.0.6 - 2018-12-06

- move declarations up to restore `var` variable hoisting behavior

# 1.0.5 - 2018-11-16

- reduce severity of log message when no passing dkim results

# 1.0.4 - 2018-11-16

- quit redis conn after last test
- add skeleton support for TLS validation
- travis: remove node 4, add node 8 CI testing

# 1.0.3 - 2016-02-06

- inherit redis config from redis.ini
- add tests for get_recipient_domains_by_txn

# 1.0.2 - 2016-02-06

- inherit from haraka-plugin-redis (vs redis)
