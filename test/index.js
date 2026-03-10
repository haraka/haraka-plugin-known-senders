const assert = require('node:assert')
const { describe, it, after, before, beforeEach } = require('node:test')

const { Address } = require('@haraka/email-address')
const fixtures = require('haraka-test-fixtures')
const tlds = require('haraka-tld')

// haraka-tld loads its TLD data asynchronously; without this, the early
// tests call get_organizational_domain() before the data is loaded and
// it returns null.
before(async () => {
  await tlds.ready
})

describe('register', () => {
  it('registers', () => {
    const plugin = new fixtures.plugin('index')
    plugin.register()
  })

  it('loads the config', () => {
    const plugin = new fixtures.plugin('index')
    plugin.register()
    assert.deepEqual(false, 'simerson.net' in plugin.cfg.ignored_ods)
    assert.deepEqual(true, 'gmail.com' in plugin.cfg.ignored_ods)
  })
})

describe('is_authenticated', () => {
  const plugin = new fixtures.plugin('index')
  plugin.register()

  let connection

  beforeEach(() => {
    connection = fixtures.connection.createConnection()
    connection.results = new fixtures.result_store(connection)
    connection.init_transaction()
  })

  it('returns empty when no auth found', async () => {
    connection.transaction.mail_from = new Address('<johndoe@test.com>')
    await new Promise((resolve) => {
      plugin.is_authenticated(function (null1, null2, sender_od) {
        assert.equal(sender_od, undefined)
        resolve()
      }, connection)
    }, connection)
  })

  it('finds OD from FCrDNS match', async () => {
    connection.transaction.mail_from = new Address(
      '<johndoe@validated-test.com>',
    )
    connection.results.add({ name: 'fcrdns' }, { fcrdns: 'validated-test.com' })
    await new Promise((resolve) => {
      plugin.is_authenticated(function (null1, null2, sender_od) {
        assert.equal(sender_od, 'validated-test.com')
        resolve()
      }, connection)
    }, connection)
  })

  it('finds OD from FCrDNS array match', async () => {
    connection.transaction.mail_from = new Address(
      '<johndoe@validated-test.com>',
    )
    connection.results.add(
      { name: 'fcrdns' },
      { fcrdns: ['validated-test.com'] },
    )
    await new Promise((resolve) => {
      plugin.is_authenticated(function (null1, null2, sender_od) {
        assert.equal(sender_od, 'validated-test.com')
        resolve()
      }, connection)
    }, connection)
  })

  it('misses OD on FCrDNS miss', async () => {
    connection.transaction.mail_from = new Address('<johndoe@invalid-test.com>')
    connection.results.add({ name: 'fcrdns' }, { fcrdns: 'valid-test.com' })
    await new Promise((resolve) => {
      plugin.is_authenticated((null1, null2, sender_od) => {
        assert.equal(sender_od, undefined)
        resolve()
      }, connection)
    }, connection)
  })

  it('finds OD on SPF mfrom match', async () => {
    connection.transaction.mail_from = new Address('<johndoe@spf-mfrom.com>')
    connection.transaction.results.add(
      { name: 'spf' },
      {
        scope: 'mfrom',
        result: 'Pass',
        domain: 'spf-mfrom.com',
      },
    )

    await new Promise((resolve) => {
      plugin.is_authenticated(function (null1, null2, sender_od) {
        assert.equal(sender_od, 'spf-mfrom.com')
        resolve()
      }, connection)
    }, connection)
  })

  it('finds OD on SPF helo match', async () => {
    connection.transaction.mail_from = new Address('<johndoe@helo-pass.com>')
    connection.results.add(
      { name: 'spf' },
      {
        scope: 'helo',
        result: 'Pass',
        domain: 'helo-pass.com',
      },
    )

    await new Promise((resolve) => {
      plugin.is_authenticated((null1, null2, sender_od) => {
        assert.equal(sender_od, 'helo-pass.com')
        resolve()
      }, connection)
    }, connection)
  })

  it('does not match when sender host has no public suffix (FCrDNS)', async () => {
    // both MAIL FROM host and fcrdns host reduce to null via haraka-tld.
    // Without guards, `null === null` produces a false-positive match
    // and `sender: null` is stored in transaction results.
    connection.transaction.mail_from = new Address('<johndoe@localhost>')
    connection.results.add({ name: 'fcrdns' }, { fcrdns: 'localhost' })
    await new Promise((resolve) => {
      plugin.is_authenticated((null1, null2, sender_od) => {
        assert.strictEqual(sender_od, undefined)
        const res = connection.transaction.results.get(plugin.name)
        assert.strictEqual(res?.sender, undefined)
        resolve()
      }, connection)
    }, connection)
  })

  it('does not match when sender host has no public suffix (SPF)', async () => {
    connection.transaction.mail_from = new Address('<johndoe@localhost>')
    connection.transaction.results.add(
      { name: 'spf' },
      { scope: 'mfrom', result: 'Pass', domain: 'localhost' },
    )
    await new Promise((resolve) => {
      plugin.is_authenticated((null1, null2, sender_od) => {
        assert.strictEqual(sender_od, undefined)
        const res = connection.transaction.results.get(plugin.name)
        assert.strictEqual(res?.sender, undefined)
        resolve()
      }, connection)
    }, connection)
  })
})

describe('check_recipient', () => {
  let connection

  beforeEach(() => {
    connection = fixtures.connection.createConnection()
    connection.init_transaction()
  })

  it('reduces domain to OD', async () => {
    const plugin = new fixtures.plugin('index')
    plugin.validated_sender_od = 'example.com'

    await new Promise((resolve) => {
      plugin.check_recipient(
        () => {
          const res = connection.transaction.results.get(plugin.name)
          assert.equal(res.rcpt_ods[0], 'example.com')
          resolve()
        },
        connection,
        new Address('<user@host.example.com>'),
      )
    })
  })
})

describe('update_sender', () => {
  let connection, plugin

  beforeEach(async () => {
    connection = fixtures.connection.createConnection()
    connection.relaying = true
    connection.init_transaction()

    plugin = new fixtures.plugin('index')
    plugin.inherits('haraka-plugin-redis')
    plugin.load_sender_ini()
    await new Promise((resolve) => {
      plugin.init_redis_plugin(resolve)
    })
  })

  after(() => {
    plugin.shutdown()
  })

  it('gets the sender domain', async () => {
    connection.transaction.mail_from = new Address('<johndoe@example.com>')

    await new Promise((resolve) => {
      plugin.update_sender(function (null1, null2, sender_dom, rcpt_doms) {
        assert.equal(sender_dom, 'example.com')
        assert.deepEqual(rcpt_doms, [])
        resolve()
      }, connection)
    }, connection)
  })

  it('gets the recipient domain', async () => {
    connection.transaction.mail_from = new Address('<johndoe@example.com>')
    connection.transaction.rcpt_to.push(new Address('<jane@test1.com>'))

    await new Promise((resolve) => {
      plugin.update_sender(function (null1, null2, sender_dom, rcpt_doms) {
        assert.equal(sender_dom, 'example.com')
        assert.deepEqual(rcpt_doms, ['test1.com'])
        resolve()
      }, connection)
    }, connection)
  })

  it('gets the recipient domains', async () => {
    connection.transaction.mail_from = new Address('<johndoe@example.com>')
    connection.transaction.rcpt_to.push(new Address('<jane@test1.com>'))
    connection.transaction.rcpt_to.push(new Address('<jane@test2.com>'))

    await new Promise((resolve) => {
      plugin.update_sender(function (null1, null2, sender_dom, rcpt_doms) {
        assert.equal(sender_dom, 'example.com')
        assert.deepEqual(rcpt_doms, ['test1.com', 'test2.com'])
        resolve()
      }, connection)
    }, connection)
  })
})

describe('get_rcpt_ods', () => {
  it('always returns an array', () => {})
})

describe('get_sender_domain_by_txn', () => {
  let plugin, connection

  beforeEach(() => {
    plugin = new fixtures.plugin('known-senders')
    connection = new fixtures.connection.createConnection()
    connection.init_transaction()
  })

  it('returns a sender domain: example.com', () => {
    connection.transaction.mail_from = new Address('<user@mail.example.com>')
    assert.equal(
      plugin.get_sender_domain_by_txn(connection.transaction),
      'example.com',
    )
  })

  it('returns a sender domain: mail.example.com', () => {
    connection.transaction.mail_from = new Address('<user@mail.example.com>')
    assert.equal(
      plugin.get_sender_domain_by_txn(connection.transaction),
      'example.com',
    )
  })

  it('returns a sender domain: bbc.co.uk', () => {
    connection.transaction.mail_from = new Address('<user@anything.bbc.co.uk>')
    assert.equal(
      plugin.get_sender_domain_by_txn(connection.transaction),
      'bbc.co.uk',
    )
  })
})

describe('get_recipient_domains_by_txn', () => {
  let plugin, connection

  beforeEach(() => {
    plugin = new fixtures.plugin('known-senders')
    connection = new fixtures.connection.createConnection()
    connection.init_transaction()
  })

  it('retrieves domains from txn recipients: example.com', () => {
    const txn = connection.transaction
    txn.rcpt_to.push(new Address('<user@example.com>'))
    const rcpt_doms = plugin.get_recipient_domains_by_txn(txn)
    assert.deepEqual(rcpt_doms, ['example.com'], rcpt_doms)
  })

  it('retrieves domains from txn recipients: example[1-2].com', () => {
    const txn = connection.transaction
    txn.rcpt_to.push(new Address('<user@example1.com>'))
    txn.rcpt_to.push(new Address('<user@example2.com>'))
    const rcpt_doms = plugin.get_recipient_domains_by_txn(txn)
    assert.deepEqual(rcpt_doms, ['example1.com', 'example2.com'], rcpt_doms)
  })

  it('retrieves unique domains from txn recipients: example.com', () => {
    const txn = connection.transaction
    txn.rcpt_to.push(new Address('<user1@example.com>'))
    txn.rcpt_to.push(new Address('<user2@example.com>'))
    const rcpt_doms = plugin.get_recipient_domains_by_txn(txn)
    assert.deepEqual(rcpt_doms, ['example.com'], rcpt_doms)
  })

  it('skips recipients whose host has no organizational domain', () => {
    // hosts without a recognised public suffix (IP literals, localhost,
    // bare names) make haraka-tld return null. Those must not leak into
    // the returned array, or downstream Redis calls fail (issue #41).
    const txn = connection.transaction
    txn.rcpt_to.push(new Address('<user@localhost>'))
    txn.rcpt_to.push(new Address('<user@example.com>'))
    const rcpt_doms = plugin.get_recipient_domains_by_txn(txn)
    assert.deepEqual(rcpt_doms, ['example.com'], rcpt_doms)
  })
})

describe('is_dkim_authenticated', () => {
  let connection, plugin

  beforeEach(async () => {
    connection = new fixtures.connection.createConnection()
    connection.init_transaction()

    plugin = new fixtures.plugin('known-senders')
    plugin.register()
    await new Promise((resolve) => {
      plugin.init_redis_plugin(resolve)
    })
  })

  after(() => {
    plugin.shutdown()
  })

  it('finds dkim results (with prior FCrDNS/SPF sender)', async () => {
    const txn = connection.transaction

    txn.results.add(plugin, { sender: 'sender.com' })
    txn.results.push(plugin, { rcpt_ods: 'rcpt.com' })
    txn.results.add({ name: 'dkim' }, { pass: ['sender.com'] })

    await new Promise((resolve) => {
      plugin.is_dkim_authenticated(() => {
        const res = txn.results.get(plugin.name)
        assert.equal('dkim', res.auth)
        resolve()
      }, connection)
    }, connection)
  })

  it('authenticates via DKIM alone (no prior FCrDNS/SPF)', async () => {
    const txn = connection.transaction

    txn.mail_from = new Address('<user@sender.com>')
    txn.results.push(plugin, { rcpt_ods: 'rcpt.com' })
    txn.results.add({ name: 'dkim' }, { pass: ['sender.com'] })

    await new Promise((resolve) => {
      plugin.is_dkim_authenticated(() => {
        const res = txn.results.get(plugin.name)
        assert.equal('dkim', res.auth)
        resolve()
      }, connection)
    }, connection)
  })

  it('skips if no dkim results present', async () => {
    const txn = connection.transaction

    txn.mail_from = new Address('<user@sender.com>')
    txn.results.push(plugin, { rcpt_ods: 'rcpt.com' })

    await new Promise((resolve) => {
      plugin.is_dkim_authenticated(() => {
        const res = txn.results.get(plugin.name)
        assert.ok(!res || !res.auth)
        resolve()
      }, connection)
    }, connection)
  })

  it('skips if dkim pass domain does not match sender_od', async () => {
    const txn = connection.transaction

    txn.mail_from = new Address('<user@sender.com>')
    txn.results.push(plugin, { rcpt_ods: 'rcpt.com' })
    txn.results.add({ name: 'dkim' }, { pass: ['other.com'] })

    await new Promise((resolve) => {
      plugin.is_dkim_authenticated(() => {
        const res = txn.results.get(plugin.name)
        assert.ok(!res || !res.auth)
        resolve()
      }, connection)
    }, connection)
  })
})
