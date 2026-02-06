const assert = require('assert')

const Address = require('address-rfc2821').Address
const constants = require('haraka-constants')
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
    this.connection.transaction.mail_from = new Address(
      '<johndoe@validated-test.com>',
    )
    this.connection.results.add(
      { name: 'fcrdns' },
      { fcrdns: 'validated-test.com' },
    )
    plugin.is_authenticated(function (null1, null2, sender_od) {
      assert.equal(sender_od, 'validated-test.com')
      done()
    }, this.connection)
  })

  it('finds OD from FCrDNS array match', function (done) {
    this.connection.transaction.mail_from = new Address(
      '<johndoe@validated-test.com>',
    )
    this.connection.results.add(
      { name: 'fcrdns' },
      { fcrdns: ['validated-test.com'] },
    )
    plugin.is_authenticated(function (null1, null2, sender_od) {
      assert.equal(sender_od, 'validated-test.com')
      done()
    }, this.connection)
  })

  it('misses OD on FCrDNS miss', function (done) {
    this.connection.transaction.mail_from = new Address(
      '<johndoe@invalid-test.com>',
    )
    this.connection.results.add(
      { name: 'fcrdns' },
      { fcrdns: 'valid-test.com' },
    )
    plugin.is_authenticated((null1, null2, sender_od) => {
      assert.equal(sender_od, undefined)
      done()
    }, this.connection)
  })

  it('finds OD on SPF mfrom match', function (done) {
    this.connection.transaction.mail_from = new Address(
      '<johndoe@spf-mfrom.com>',
    )
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
    this.connection.transaction.mail_from = new Address(
      '<johndoe@helo-pass.com>',
    )
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
    this.connection.transaction.mail_from = new Address(
      '<user@mail.example.com>',
    )
    assert.equal(
      this.plugin.get_sender_domain_by_txn(this.connection.transaction),
      'example.com',
    )
  })

  it('returns a sender domain: mail.example.com', function () {
    this.connection.transaction.mail_from = new Address(
      '<user@mail.example.com>',
    )
    assert.equal(
      this.plugin.get_sender_domain_by_txn(this.connection.transaction),
      'example.com',
    )
  })

  it('returns a sender domain: bbc.co.uk', function () {
    this.connection.transaction.mail_from = new Address(
      '<user@anything.bbc.co.uk>',
    )
    assert.equal(
      this.plugin.get_sender_domain_by_txn(this.connection.transaction),
      'bbc.co.uk',
    )
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
  let plugin
  let connection

  beforeEach(function () {
    connection = fixtures.connection.createConnection()
    connection.init_transaction()

    plugin = new fixtures.plugin('index')
    plugin.register()
  })

  it('allows messages when no commonly abused names configured', function (done) {
    // Clear the commonly_abused config
    plugin.cfg.commonly_abused = {}
    
    const header_from = 'Costco Support <spam@spammer.com>'
    connection.transaction.header.add('From', header_from)
    connection.transaction.header.add('Subject', 'Your Costco Order')
    connection.transaction.mail_from = new Address('<spam@spammer.com>')

    plugin.check_abused_names(function (code) {
      assert.equal(code, undefined)
      done()
    }, connection)
  })

  it('allows outbound messages without checking', function (done) {
    connection.relaying = true
    const header_from = 'Costco Support <spam@spammer.com>'
    connection.transaction.header.add('From', header_from)
    connection.transaction.header.add('Subject', 'Your Costco Order')
    connection.transaction.mail_from = new Address('<spam@spammer.com>')

    plugin.check_abused_names(function (code) {
      assert.equal(code, undefined)
      done()
    }, connection)
  })

  it('rejects when costco in subject but domain is not costco.com', function (done) {
    const header_from = 'Support <spam@spammer.com>'
    connection.transaction.header.add('From', header_from)
    connection.transaction.header.add('Subject', 'Your Costco Order Confirmation')
    connection.transaction.mail_from = new Address('<spam@spammer.com>')

    plugin.check_abused_names(function (code, msg) {
      assert.equal(code, constants.DENY)
      assert.ok(msg.includes('impersonate'))
      assert.ok(msg.includes('costco.com'))
      done()
    }, connection)
  })

  it('rejects when c0stc0 (with zeros) in subject but domain is not costco.com', function (done) {
    const header_from = 'Support <spam@evil.com>'
    connection.transaction.header.add('From', header_from)
    connection.transaction.header.add('Subject', 'Your c0stc0 Order')
    connection.transaction.mail_from = new Address('<spam@evil.com>')

    plugin.check_abused_names(function (code, msg) {
      assert.equal(code, constants.DENY)
      assert.ok(msg.includes('impersonate'))
      done()
    }, connection)
  })

  it('rejects when costco in header from but domain is not costco.com', function (done) {
    const header_from = 'Costco Support <spam@spammer.com>'
    connection.transaction.header.add('From', header_from)
    connection.transaction.header.add('Subject', 'Order Update')
    connection.transaction.mail_from = new Address('<spam@spammer.com>')

    plugin.check_abused_names(function (code, msg) {
      assert.equal(code, constants.DENY)
      assert.ok(msg.includes('impersonate'))
      done()
    }, connection)
  })

  it('rejects when costco in envelope from local part but domain is not costco.com', function (done) {
    const header_from = 'Support Team <spam@spammer.com>'
    connection.transaction.header.add('From', header_from)
    connection.transaction.header.add('Subject', 'Important Notice')
    connection.transaction.mail_from = new Address('<costco-support@spammer.com>')

    plugin.check_abused_names(function (code, msg) {
      assert.equal(code, constants.DENY)
      assert.ok(msg.includes('impersonate'))
      done()
    }, connection)
  })

  it('allows when costco in subject and envelope domain is costco.com', function (done) {
    const header_from = 'Costco Support <noreply@costco.com>'
    connection.transaction.header.add('From', header_from)
    connection.transaction.header.add('Subject', 'Your Costco Order')
    connection.transaction.mail_from = new Address('<noreply@costco.com>')

    plugin.check_abused_names(function (code) {
      assert.equal(code, undefined)
      done()
    }, connection)
  })

  it('allows when costco in subject and header from domain is costco.com', function (done) {
    const header_from = 'Costco Support <noreply@costco.com>'
    connection.transaction.header.add('From', header_from)
    connection.transaction.header.add('Subject', 'Your Costco Order')
    connection.transaction.mail_from = new Address('<spam@spammer.com>')

    plugin.check_abused_names(function (code) {
      assert.equal(code, undefined)
      done()
    }, connection)
  })

  it('allows when costco in subject and envelope domain is subdomain of costco.com', function (done) {
    const header_from = 'Costco Support <noreply@mail.costco.com>'
    connection.transaction.header.add('From', header_from)
    connection.transaction.header.add('Subject', 'Your Costco Order')
    connection.transaction.mail_from = new Address('<noreply@mail.costco.com>')

    plugin.check_abused_names(function (code) {
      assert.equal(code, undefined)
      done()
    }, connection)
  })

  it('allows messages without abused names', function (done) {
    const header_from = 'John Doe <john@example.com>'
    connection.transaction.header.add('From', header_from)
    connection.transaction.header.add('Subject', 'Hello there')
    connection.transaction.mail_from = new Address('<john@example.com>')

    plugin.check_abused_names(function (code) {
      assert.equal(code, undefined)
      done()
    }, connection)
  })

  it('is case-insensitive when checking abused names', function (done) {
    const header_from = 'COSTCO Support <spam@spammer.com>'
    connection.transaction.header.add('From', header_from)
    connection.transaction.header.add('Subject', 'Your COSTCO Order')
    connection.transaction.mail_from = new Address('<spam@spammer.com>')

    plugin.check_abused_names(function (code) {
      assert.equal(code, constants.DENY)
      done()
    }, connection)
  })

  it('rejects paypal abuse', function (done) {
    const header_from = 'PayPal Security <noreply@phishing.com>'
    connection.transaction.header.add('From', header_from)
    connection.transaction.header.add('Subject', 'Verify your PayPal account')
    connection.transaction.mail_from = new Address('<noreply@phishing.com>')

    plugin.check_abused_names(function (code, msg) {
      assert.equal(code, constants.DENY)
      assert.ok(msg.includes('paypal.com'))
      done()
    }, connection)
  })
})
