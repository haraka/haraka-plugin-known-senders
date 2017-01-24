'use strict';

var tlds = require('haraka-tld');

exports.register = function () {
  var plugin = this;

  plugin.register_hook('mail',     'check_sender_early');
  plugin.register_hook('rcpt_ok',  'check_recipient');
  plugin.register_hook('queue_ok', 'update_sender');
}

exports.check_sender_early = function (next, connection, params) {
  var plugin = this;

  if (connection.relaying) return next();

  var sender_od = plugin.get_sender_domain(connection.transaction);

  if (plugin.has_fcrdns_match(sender_od, connection)) {
    return next(null, sender_od);
  }
  if (plugin.has_spf_match(sender_od, connection)) {
    return next(null, sender_od);
  }

  // no other auth mechanisms to test
  return next();
}

exports.check_recipient = function (next, connection, rcpt) {
  var plugin = this;
  // a plugin has vouched that the rcpt is for a domain we accept mail for

  function errNext (err) {
    plugin.logerror(err);
    next();
  }

  // if no validated sender domain, there's nothing to do here
  if (!plugin.validated_sender_od) return errNext('no valid sender od');

  if (!rcpt.host) return errNext('rcpt.host unset?');

  var rcpt_od = tlds.get_organizational_domain(rcpt.host);
  if (!rcpt_od) return errNext('no rcpt od');

  // DO THE CHECK

  return next();
}

exports.update_sender = function (next, connection, params) {
  var plugin = this;
  // queue_ok arguments: next, connection, msg
  // ok 1390590369 qp 634 (F82E2DD5-9238-41DC-BC95-9C3A02716AD2.1)

  function errNext (err) {
    plugin.logerror(err);
    next();
  }

  plugin.loginfo(plugin, params);
  if (!connection) return errNext('no connection');
  if (!connection.transaction) return errNext('no transaction');
  if (!connection.relaying) return errNext('not relaying');
  var txn = connection.transaction;

  var sender_od = plugin.get_sender_domain(txn);
  if (!sender_od) return errNext('no sender domain');
  plugin.loginfo('sender domain: ' + sender_od);

  var rcpt_domains = plugin.get_recipient_domains(txn);
  if (rcpt_domains.length === 0) {
    plugin.logerror('no recipient domains');
  }
  else {
    plugin.loginfo('recip domains: ' + rcpt_domains.join(','));
  }

  next(undefined, sender_od, rcpt_domains);
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
      // not a duplicate, add to the list
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

exports.has_fcrdns_match = function (sender_od, connection) {
  var plugin = this;
  var fcrdns = connection.results.get('fcrdns');
  if (!fcrdns) return false;
  if (!fcrdns.fcrdns) return false;

  var fcrdns_od = tlds.get_organizational_domain(fcrdns.fcrdns);
  if (fcrdns_od !== sender_od) return false;

  plugin.validated_sender_od = sender_od;
  return true;
}

exports.has_spf_match = function (sender_od, connection) {

  var spf = connection.results.get('spf');
  if (spf && spf.domain && spf.result === 'pass') {
    // scope=helo (HELO/EHLO)
    if (tlds.get_organizational_domain(spf.domain) === sender_od) {
      return true;
    }
  }

  spf = connection.transaction.results.get('spf');
  if (spf && spf.domain && spf.result === 'pass') {
    // scope=mfrom (HELO/EHLO)
    if (tlds.get_organizational_domain(spf.domain) === sender_od) {
      return true;
    }
  }

  // this.loginfo(spf);
  return false;
}