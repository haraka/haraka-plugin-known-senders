var tlds = require('haraka-tld');

exports.register = function () {
  var plugin = this;

  plugin.register_hook('queue_ok', 'after_queue');
}

exports.after_queue = function (next, connection, params) {
  var plugin = this;
  // queue_ok arguments: next, connection, msg
  // ok 1390590369 qp 634 (F82E2DD5-9238-41DC-BC95-9C3A02716AD2.1)

  plugin.loginfo(plugin, params);
  if (!connection) return next();
  if (!connection.transaction) return next();
  var txn = connection.transaction;

  var sender_od = plugin.get_sender_domain(txn);
  if (!sender_od) return next();
  var rcpt_domains = plugin.get_recipient_domains(txn);
  if (rcpt_domains.length === 0) return next();

  plugin.loginfo('sender domain: ' + sender_od);
  plugin.loginfo('recip domains: ' + rcpt_domains.join(','));

  next();
}

exports.get_recipient_domains = function (txn) {
  var plugin = this;

  var rcpt_domains = [];
  if (!txn.rcpt_to) return;

  for (let i=0; i < txn.rcpt_to.length; i++) {
    if (!txn.rcpt_to[i].host) continue;
    var rcpt_od = tlds.get_organizational_domain(txn.rcpt_to[i].host);
    if (txn.rcpt_to[i].host !== rcpt_od) {
      plugin.loginfo('rcpt: ' + txn.rcpt_to[i].host + ' -> ' + rcpt_od);
    }
    if (rcpt_domains.indexOf(rcpt_od) === -1) {
      rcpt_domains.push(rcpt_od);
    }
  }
  return rcpt_domains;
}

exports.get_sender_domain = function (txn) {
  var plugin = this;

  if (!txn.mail_from) return;
  if (!txn.mail_from.host) return;
  var sender_od = tlds.get_organizational_domain(txn.mail_from.host);
  if (txn.mail_from.host !== sender_od) {
    plugin.loginfo('sender: ' + txn.mail_from.host + ' -> ' + sender_od);
  }
  return sender_od;
}