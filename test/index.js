const assert = require('assert')

const Address = require('address-rfc2821').Address
const fixtures = require('haraka-test-fixtures')

describe('register', function () {
  it('registers', function () {
    const plugin = new fixtures.plugin('index')
    plugin.register()
  })

  it('loads the config', function () {
    const plugin = new fixtures.plugin('index')
    plugin.register()
    assert.deepEqual(false, 'simerson.net' in plugin.cfg.ignored_ods)
    assert.deepEqual(true, 'gmail.com' in plugin.cfg.ignored_ods)
  })
})

describe('is_authenticated', function () {
  const plugin = new fixtures.plugin('index')
  plugin.register()

  beforeEach(function () {
    this.connection = fixtures.connection.createConnection()
    this.connection.results = new fixtures.result_store(this.connection)
    this.connection.init_transaction()
  })

  it('returns empty when no auth found', function (done) {
    this.connection.transaction.mail_from = new Address('<johndoe@test.com>')
    plugin.is_authenticated(function (null1, null2, sender_od) {
      assert.equal(sender_od, undefined)
      done()
    }, this.connection)
  })

  it('finds OD from FCrDNS match', function (done) {
    this.connection.transaction.mail_from = new Address('<johndoe@validated-test.com>')
    this.connection.results.add({ name: 'fcrdns' }, { fcrdns: 'validated-test.com' })
    plugin.is_authenticated(function (null1, null2, sender_od) {
      assert.equal(sender_od, 'validated-test.com')
      done()
    }, this.connection)
  })

  it('finds OD from FCrDNS array match', function (done) {
    this.connection.transaction.mail_from = new Address('<johndoe@validated-test.com>')
    this.connection.results.add({ name: 'fcrdns' }, { fcrdns: ['validated-test.com'] })
    plugin.is_authenticated(function (null1, null2, sender_od) {
      assert.equal(sender_od, 'validated-test.com')
      done()
    }, this.connection)
  })

  it('misses OD on FCrDNS miss', function (done) {
    this.connection.transaction.mail_from = new Address('<johndoe@invalid-test.com>')
    this.connection.results.add({ name: 'fcrdns' }, { fcrdns: 'valid-test.com' })
    plugin.is_authenticated((null1, null2, sender_od) => {
      assert.equal(sender_od, undefined)
      done()
    }, this.connection)
  })

  it('finds OD on SPF mfrom match', function (done) {
    this.connection.transaction.mail_from = new Address('<johndoe@spf-mfrom.com>')
    this.connection.transaction.results.add(
      { name: 'spf' },
      {
        scope: 'mfrom',
        result: 'Pass',
        domain: 'spf-mfrom.com',
      },
    )

    plugin.is_authenticated(function (null1, null2, sender_od) {
      assert.equal(sender_od, 'spf-mfrom.com')
      done()
    }, this.connection)
  })

  it('finds OD on SPF helo match', function (done) {
    this.connection.transaction.mail_from = new Address('<johndoe@helo-pass.com>')
    this.connection.results.add(
      { name: 'spf' },
      {
        scope: 'helo',
        result: 'Pass',
        domain: 'helo-pass.com',
      },
    )

    plugin.is_authenticated((null1, null2, sender_od) => {
      assert.equal(sender_od, 'helo-pass.com')
      done()
    }, this.connection)
  })
})

describe('check_recipient', function () {
  let connection

  beforeEach(function () {
    connection = fixtures.connection.createConnection()
    connection.init_transaction()
  })

  it('reduces domain to OD', function (done) {
    const plugin = new fixtures.plugin('index')
    plugin.validated_sender_od = 'example.com'

    plugin.check_recipient(
      () => {
        const res = connection.transaction.results.get(plugin.name)
        assert.equal(res.rcpt_ods[0], 'example.com')
        done()
      },
      connection,
      new Address('<user@host.example.com>'),
    )
  })
})

describe('update_sender', function () {
  beforeEach(function (done) {
    this.connection = fixtures.connection.createConnection()
    this.connection.relaying = true
    this.connection.init_transaction()

    this.plugin = new fixtures.plugin('index')
    this.plugin.inherits('haraka-plugin-redis')
    this.plugin.load_sender_ini()
    this.plugin.init_redis_plugin(done)
  })

  after(function () {
    this.plugin.shutdown()
  })

  it('gets the sender domain', function (done) {
    this.connection.transaction.mail_from = new Address('<johndoe@example.com>')

    this.plugin.update_sender(function (null1, null2, sender_dom, rcpt_doms) {
      assert.equal(sender_dom, 'example.com')
      assert.deepEqual(rcpt_doms, [])
      done()
    }, this.connection)
  })

  it('gets the recipient domain', function (done) {
    this.connection.transaction.mail_from = new Address('<johndoe@example.com>')
    this.connection.transaction.rcpt_to.push(new Address('<jane@test1.com>'))

    this.plugin.update_sender(function (null1, null2, sender_dom, rcpt_doms) {
      assert.equal(sender_dom, 'example.com')
      assert.deepEqual(rcpt_doms, ['test1.com'])
      done()
    }, this.connection)
  })

  it('gets the recipient domains', function (done) {
    this.connection.transaction.mail_from = new Address('<johndoe@example.com>')
    this.connection.transaction.rcpt_to.push(new Address('<jane@test1.com>'))
    this.connection.transaction.rcpt_to.push(new Address('<jane@test2.com>'))

    this.plugin.update_sender(function (null1, null2, sender_dom, rcpt_doms) {
      assert.equal(sender_dom, 'example.com')
      assert.deepEqual(rcpt_doms, ['test1.com', 'test2.com'])
      done()
    }, this.connection)
  })
})

describe('get_rcpt_ods', function () {
  it('always returns an array', function () {})
})

describe('get_sender_domain_by_txn', function () {
  beforeEach(function () {
    this.plugin = new fixtures.plugin('known-senders')
    this.connection = new fixtures.connection.createConnection()
    this.connection.init_transaction()
  })

  it('returns a sender domain: example.com', function () {
    this.connection.transaction.mail_from = new Address('<user@mail.example.com>')
    assert.equal(this.plugin.get_sender_domain_by_txn(this.connection.transaction), 'example.com')
  })

  it('returns a sender domain: mail.example.com', function () {
    this.connection.transaction.mail_from = new Address('<user@mail.example.com>')
    assert.equal(this.plugin.get_sender_domain_by_txn(this.connection.transaction), 'example.com')
  })

  it('returns a sender domain: bbc.co.uk', function () {
    this.connection.transaction.mail_from = new Address('<user@anything.bbc.co.uk>')
    assert.equal(this.plugin.get_sender_domain_by_txn(this.connection.transaction), 'bbc.co.uk')
  })
})

describe('get_recipient_domains_by_txn', function () {
  beforeEach(function () {
    this.plugin = new fixtures.plugin('known-senders')
    this.connection = new fixtures.connection.createConnection()
    this.connection.init_transaction()
  })

  it('retrieves domains from txn recipients: example.com', function () {
    const txn = this.connection.transaction
    txn.rcpt_to.push(new Address('<user@example.com>'))
    const rcpt_doms = this.plugin.get_recipient_domains_by_txn(txn)
    assert.deepEqual(rcpt_doms, ['example.com'], rcpt_doms)
  })

  it('retrieves domains from txn recipients: example[1-2].com', function () {
    const txn = this.connection.transaction
    txn.rcpt_to.push(new Address('<user@example1.com>'))
    txn.rcpt_to.push(new Address('<user@example2.com>'))
    const rcpt_doms = this.plugin.get_recipient_domains_by_txn(txn)
    assert.deepEqual(rcpt_doms, ['example1.com', 'example2.com'], rcpt_doms)
  })

  it('retrieves unique domains from txn recipients: example.com', function () {
    const txn = this.connection.transaction
    txn.rcpt_to.push(new Address('<user1@example.com>'))
    txn.rcpt_to.push(new Address('<user2@example.com>'))
    const rcpt_doms = this.plugin.get_recipient_domains_by_txn(txn)
    assert.deepEqual(rcpt_doms, ['example.com'], rcpt_doms)
  })
})

describe('is_dkim_authenticated', function () {
  beforeEach(function (done) {
    this.connection = new fixtures.connection.createConnection()
    this.connection.init_transaction()

    this.plugin = new fixtures.plugin('known-senders')
    this.plugin.register()
    this.plugin.init_redis_plugin(done)
  })

  after(function () {
    this.plugin.shutdown()
  })

  it('finds dkim results', function (done) {
    const plugin = this.plugin
    const connection = this.connection
    const txn = this.connection.transaction

    txn.results.add(plugin, { sender: 'sender.com' })
    txn.results.push(plugin, { rcpt_ods: 'rcpt.com' })
    txn.results.add({ name: 'dkim_verify' }, { pass: 'sender.com' })

    plugin.is_dkim_authenticated(() => {
      const res = txn.results.get(plugin.name)
      assert.equal('dkim', res.auth)
      done()
    }, connection)
  })
})

describe('check_abused_names', function () {

  beforeEach(function () {
    this.connection = fixtures.connection.createConnection()
    this.connection.init_transaction()

    this.plugin = new fixtures.plugin('index')
    this.plugin.register()
  })

  it('allows messages when no commonly abused names configured', function (done) {
    // Clear the commonly_abused config
    this.plugin.cfg.commonly_abused = {}

    this.connection.transaction.header.add('From', 'Costco Support <spam@spammer.com>')
    this.connection.transaction.header.add('Subject', 'Your Costco Order')
    this.connection.transaction.mail_from = new Address('<spam@spammer.com>')

    this.plugin.check_abused_names(function (code) {
      assert.equal(code, undefined)
      done()
    }, this.connection)
  })

  it('allows outbound messages without checking', function (done) {
    this.connection.relaying = true
    this.connection.transaction.header.add('From', 'Costco Support <spam@spammer.com>')
    this.connection.transaction.header.add('Subject', 'Your Costco Order')
    this.connection.transaction.mail_from = new Address('<spam@spammer.com>')

    this.plugin.check_abused_names(function (code) {
      assert.equal(code, undefined)
      done()
    }, this.connection)
  })

  it('rejects when costco in subject but domain is not costco.com', function (done) {
    this.connection.transaction.header.add('From', 'Support <spam@spammer.com>')
    this.connection.transaction.header.add('Subject', 'Your Costco Order Confirmation')
    this.connection.transaction.mail_from = new Address('<spam@spammer.com>')

    this.plugin.check_abused_names(function (code, msg) {
      assert.equal(code, DENY)
      assert.ok(msg.includes('impersonate'))
      assert.ok(msg.includes('costco.com'))
      done()
    }, this.connection)
  })

  it('rejects when c0stc0 (with zeros) in subject but domain is not costco.com', function (done) {
    this.connection.transaction.header.add('From', 'Support <spam@evil.com>')
    this.connection.transaction.header.add('Subject', 'Your c0stc0 Order')
    this.connection.transaction.mail_from = new Address('<spam@evil.com>')

    this.plugin.check_abused_names(function (code, msg) {
      assert.equal(code, DENY)
      assert.ok(msg.includes('impersonate'))
      done()
    }, this.connection)
  })

  it('rejects when costco in header from but domain is not costco.com', function (done) {
    this.connection.transaction.header.add('From', 'Costco Support <spam@spammer.com>')
    this.connection.transaction.header.add('Subject', 'Order Update')
    this.connection.transaction.mail_from = new Address('<spam@spammer.com>')

    this.plugin.check_abused_names(function (code, msg) {
      assert.equal(code, DENY)
      assert.ok(msg.includes('impersonate'))
      done()
    }, this.connection)
  })

  it('rejects when costco in envelope from local part but domain is not costco.com', function (done) {
    this.connection.transaction.header.add('From', 'Support Team <spam@spammer.com>')
    this.connection.transaction.header.add('Subject', 'Important Notice')
    this.connection.transaction.mail_from = new Address('<costco-support@spammer.com>')

    this.plugin.check_abused_names(function (code, msg) {
      assert.equal(code, DENY)
      assert.ok(msg.includes('impersonate'))
      done()
    }, this.connection)
  })

  it('allows when costco in subject and envelope domain is costco.com', function (done) {
    this.connection.transaction.header.add('From', 'Costco Support <noreply@costco.com>')
    this.connection.transaction.header.add('Subject', 'Your Costco Order')
    this.connection.transaction.mail_from = new Address('<noreply@costco.com>')

    this.plugin.check_abused_names(function (code) {
      assert.equal(code, undefined)
      done()
    }, this.connection)
  })

  it('allows when costco in subject and header from domain is costco.com', function (done) {
    this.connection.transaction.header.add('From', 'Costco Support <noreply@costco.com>')
    this.connection.transaction.header.add('Subject', 'Your Costco Order')
    this.connection.transaction.mail_from = new Address('<spam@spammer.com>')

    this.plugin.check_abused_names(function (code) {
      assert.equal(code, undefined)
      done()
    }, this.connection)
  })

  it('allows when costco in subject and envelope domain is subdomain of costco.com', function (done) {
    this.connection.transaction.header.add('From', 'Costco Support <noreply@mail.costco.com>')
    this.connection.transaction.header.add('Subject', 'Your Costco Order')
    this.connection.transaction.mail_from = new Address('<noreply@mail.costco.com>')

    this.plugin.check_abused_names(function (code) {
      assert.equal(code, undefined)
      done()
    }, this.connection)
  })

  it('allows messages without abused names', function (done) {
    this.connection.transaction.header.add('From', 'John Doe <john@example.com>')
    this.connection.transaction.header.add('Subject', 'Hello there')
    this.connection.transaction.mail_from = new Address('<john@example.com>')

    this.plugin.check_abused_names(function (code) {
      assert.equal(code, undefined)
      done()
    }, this.connection)
  })

  it('is case-insensitive when checking abused names', function (done) {
    this.connection.transaction.header.add('From', 'COSTCO Support <spam@spammer.com>')
    this.connection.transaction.header.add('Subject', 'Your COSTCO Order')
    this.connection.transaction.mail_from = new Address('<spam@spammer.com>')

    this.plugin.check_abused_names(function (code) {
      assert.equal(code, DENY)
      done()
    }, this.connection)
  })

  it('rejects paypal abuse', function (done) {
    this.connection.transaction.header.add('From', 'PayPal Security <noreply@phishing.com>')
    this.connection.transaction.header.add('Subject', 'Verify your PayPal account')
    this.connection.transaction.mail_from = new Address('<noreply@phishing.com>')

    this.plugin.check_abused_names(function (code, msg) {
      assert.equal(code, DENY)
      assert.ok(msg.includes('paypal.com'))
      done()
    }, this.connection)
  })

  it('avoids false positives with substring matches', function (done) {
    // "purchase" contains "chase" but should not be flagged
    this.connection.transaction.header.add('From', 'John Doe <john@example.com>')
    this.connection.transaction.header.add('Subject', 'Thank you for your purchase')
    this.connection.transaction.mail_from = new Address('<john@example.com>')

    this.plugin.check_abused_names(function (code) {
      assert.equal(code, undefined)
      done()
    }, this.connection)
  })

  it('avoids false positives with domain names', function (done) {
    // "tamazon.com" contains "amazon" but should not be flagged in domain
    this.connection.transaction.header.add('From', 'Support <support@tamazon.com>')
    this.connection.transaction.header.add('Subject', 'Your order update')
    this.connection.transaction.mail_from = new Address('<support@tamazon.com>')

    this.plugin.check_abused_names(function (code) {
      assert.equal(code, undefined)
      done()
    }, this.connection)
  })

  it('handles complex email address formats', function (done) {
    // Test with quoted display name
    this.connection.transaction.header.add('From', '"Costco Support Team" <spam@spammer.com>')
    this.connection.transaction.header.add('Subject', 'Order notification')
    this.connection.transaction.mail_from = new Address('<spam@spammer.com>')

    this.plugin.check_abused_names(function (code, msg) {
      assert.equal(code, DENY)
      assert.ok(msg.includes('costco.com'))
      done()
    }, this.connection)
  })
})
