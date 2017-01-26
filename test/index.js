
var assert   = require('assert');

var Address  = require('address-rfc2821').Address;
var fixtures = require('haraka-test-fixtures');

describe('is_authenticated', function () {

  var plugin = fixtures.plugin('index');
  var connection;

  beforeEach(function (done) {
    connection = fixtures.connection.createConnection();
    connection.results = new fixtures.result_store(connection);
    connection.transaction = fixtures.transaction.createTransaction();
    connection.transaction.results = new fixtures.result_store(connection);
    done();
  });

  it('returns empty when no auth found', function (done) {
    connection.transaction.mail_from = new Address('<johndoe@test.com>');
    plugin.is_authenticated(function (null1, null2, sender_od) {
      assert.equal(sender_od, undefined);
      done();
    },
    connection);
  });

  it('finds OD from FCrDNS match', function (done) {
    connection.transaction.mail_from = new Address('<johndoe@validated-test.com>');
    connection.results.add({ name: 'fcrdns'}, {fcrdns: 'validated-test.com'});
    plugin.is_authenticated(function (null1, null2, sender_od) {
      assert.equal(sender_od, 'validated-test.com');
      done();
    },
    connection);
  });

  it('misses OD on FCrDNS miss', function (done) {
    connection.transaction.mail_from = new Address('<johndoe@invalid-test.com>');
    connection.results.add({ name: 'fcrdns'}, {fcrdns: 'valid-test.com'});
    plugin.is_authenticated(function (null1, null2, sender_od) {
      assert.equal(sender_od, undefined);
      done();
    },
    connection);
  });

  it('finds OD on SPF mfrom match', function (done) {
    connection.transaction.mail_from = new Address('<johndoe@spf-mfrom.com>');
    connection.transaction.results.add({ name: 'spf'}, {
      scope: 'mfrom',
      result: 'Pass',
      domain: 'spf-mfrom.com',
    });

    plugin.is_authenticated(function (null1, null2, sender_od) {
      assert.equal(sender_od, 'spf-mfrom.com');
      done();
    },
    connection);
  });

  it('finds OD on SPF helo match', function (done) {
    connection.transaction.mail_from = new Address('<johndoe@helo-pass.com>');
    connection.results.add({ name: 'spf'}, {
      scope: 'helo',
      result: 'Pass',
      domain: 'helo-pass.com',
    });

    plugin.is_authenticated(function (null1, null2, sender_od) {
      assert.equal(sender_od, 'helo-pass.com');
      done();
    },
    connection);
  });
});

describe('check_recipient', function () {
  var connection;

  beforeEach(function (done) {
    connection = fixtures.connection.createConnection();
    // connection.relaying = true;
    connection.transaction = fixtures.transaction.createTransaction();
    connection.transaction.results = new fixtures.result_store(connection);
    done();
  });

  it('reduces domain to OD', function (done) {
    var plugin = fixtures.plugin('index');
    plugin.validated_sender_od = 'example.com';

    plugin.check_recipient(function () {
      var res = connection.transaction.results.get(plugin.name);
      assert.equal(res.rcpt_ods[0], 'example.com');
      done();
    },
    connection,
    new Address('<user@host.example.com>'));
  });
});

describe('update_sender', function () {

  var plugin = fixtures.plugin('index');
  plugin.db = {
    multi :function () { return plugin.db; },
    hget : function () {},
    hincrby : function () {},
    exec: function (cb) { if (cb) cb(null, []); },
  }
  var connection;

  beforeEach(function (done) {
    connection = fixtures.connection.createConnection();
    connection.relaying = true;
    connection.transaction = fixtures.transaction.createTransaction();
    done();
  });

  it('gets the sender domain', function (done) {
    connection.transaction.mail_from = new Address('<johndoe@example.com>');

    plugin.update_sender(function (null1, null2, sender_dom, rcpt_doms) {
      assert.equal(sender_dom, 'example.com');
      assert.deepEqual(rcpt_doms, [])
      done();
    },
    connection);
  });

  it('gets the recipient domain', function (done) {
    connection.transaction.mail_from = new Address('<johndoe@example.com>');
    connection.transaction.rcpt_to.push(new Address('<jane@test1.com>'));

    plugin.update_sender(function (null1, null2, sender_dom, rcpt_doms) {
      assert.equal(sender_dom, 'example.com');
      assert.deepEqual(rcpt_doms, ['test1.com']);
      done();
    },
    connection);
  });

  it('gets the recipient domains', function (done) {
    connection.transaction.mail_from = new Address('<johndoe@example.com>');
    connection.transaction.rcpt_to.push(new Address('<jane@test1.com>'));
    connection.transaction.rcpt_to.push(new Address('<jane@test2.com>'));

    plugin.update_sender(function (null1, null2, sender_dom, rcpt_doms) {
      assert.equal(sender_dom, 'example.com');
      assert.deepEqual(rcpt_doms, ['test1.com', 'test2.com']);
      done();
    },
    connection);
  });
});

describe('is_dkim_authenticated', function () {

  var plugin = fixtures.plugin('index');
  plugin.db = {
    multi : function () { return plugin.db; },
    hget : function () {},
    hincrby : function () {},
    exec: function (cb) { cb(null, []); },
  }
  var connection;

  beforeEach(function (done) {
    connection = fixtures.connection.createConnection();
    connection.transaction = fixtures.transaction.createTransaction();
    connection.transaction.results = new fixtures.result_store(connection);
    done();
  });

  it('finds dkim results', function (done) {
    connection.transaction.results.add(plugin, { sender: 'sender.com' });
    connection.transaction.results.push(plugin, { rcpt_ods: 'rcpt.com' });
    connection.transaction.results.add({name: 'dkim_verify'}, { pass: 'sender.com'});

    plugin.is_dkim_authenticated(function () {
      var res = connection.transaction.results.get(plugin.name);
      assert.equal('dkim', res.auth);
      done();
    },
    connection);
  });
});