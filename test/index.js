
var assert   = require('assert');

var Address  = require('address-rfc2821').Address;
var fixtures = require('haraka-test-fixtures');



describe('after_queue', function () {

  var plugin = fixtures.plugin('index');
  var connection;

  beforeEach(function (done) {
    connection = fixtures.connection.createConnection();
    connection.relaying = true;
    connection.transaction = fixtures.transaction.createTransaction();
    done();
  });

  it('gets the sender domain', function (done) {
    connection.transaction.mail_from = new Address('<johndoe@example.com>');

    plugin.after_queue(function (undefined, sender_dom, rcpt_doms) {
      assert.equal(sender_dom, 'example.com');
      assert.deepEqual(rcpt_doms, [])
      done();
    },
    connection);
  });

  it('gets the recipient domain', function (done) {
    connection.transaction.mail_from = new Address('<johndoe@example.com>');
    connection.transaction.rcpt_to.push(new Address('<jane@test1.com>'));

    plugin.after_queue(function (undefined, sender_dom, rcpt_doms) {
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

    plugin.after_queue(function (undefined, sender_dom, rcpt_doms) {
      assert.equal(sender_dom, 'example.com');
      assert.deepEqual(rcpt_doms, ['test1.com', 'test2.com']);
      done();
    },
    connection);
  });
});