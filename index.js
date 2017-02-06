'use strict';

var tlds = require('haraka-tld');

exports.register = function () {
  var plugin = this;
  plugin.inherits('haraka-plugin-redis');

  plugin.load_sender_ini();

  plugin.register_hook('init_master',  'init_redis_plugin');
  plugin.register_hook('init_child',   'init_redis_plugin');

  plugin.register_hook('mail',       'is_authenticated');
  plugin.register_hook('rcpt_ok',    'check_recipient');
  plugin.register_hook('queue_ok',   'update_sender');
  plugin.register_hook('data_post',  'is_dkim_authenticated');
}

exports.load_sender_ini = function () {
  var plugin = this;

  plugin.cfg = plugin.config.get('known-senders.ini', function () {
    plugin.load_sender_ini();
  });

  plugin.merge_redis_ini();
}

/*
 *                 Outbound Processing
 *
 * Identify and save to Redis domains the local users send email to
 *
 * Context: these functions run after a message has been queued.
 *
*/

exports.update_sender = function (next, connection, params) {
  var plugin = this;
  // queue_ok arguments: next, connection, msg
  // ok 1390590369 qp 634 (F82E2DD5-9238-41DC-BC95-9C3A02716AD2.1)

  function errNext (err) {
    connection.logerror(plugin, 'update_sender: ' + err);
    next(null, null, sender_od, rcpt_domains);
  }

  // connection.loginfo(plugin, params);
  if (!connection) return errNext('no connection');
  if (!connection.transaction) return errNext('no transaction');
  if (!connection.relaying) return next();
  var txn = connection.transaction;

  var sender_od = plugin.get_sender_domain_by_txn(txn);
  if (!sender_od) return errNext('no sender domain');

  var rcpt_domains = plugin.get_recipient_domains_by_txn(txn);
  if (rcpt_domains.length === 0) {
    return errNext('no rcpt ODs for ' + sender_od);
  }

  // within this function, the sender is a local domain
  // and the recipient is an external domain
  var multi = plugin.db.multi();
  for (let i = 0; i < rcpt_domains.length; i++) {
    multi.hincrby(sender_od, rcpt_domains[i], 1);
  }

  multi.exec(function (err, replies) {
    if (err) {
      connection.logerror(plugin, err);
      return next();
    }
    for (let i = 0; i < rcpt_domains.length; i++) {
      connection.loginfo(plugin, 'saved ' + sender_od + ' : ' + rcpt_domains[i] + ' : ' + replies[i]);
    }
    next(null, null, sender_od, rcpt_domains);
  });
}

exports.get_sender_domain_by_txn = function (txn) {
  var plugin = this;

  if (!txn.mail_from) return;
  if (!txn.mail_from.host) return;
  var sender_od = tlds.get_organizational_domain(txn.mail_from.host);
  if (txn.mail_from.host !== sender_od) {
    plugin.logdebug('sender: ' + txn.mail_from.host + ' -> ' + sender_od);
  }
  return sender_od;
}

exports.get_recipient_domains_by_txn = function (txn) {
  var plugin = this;

  var rcpt_domains = [];
  if (!txn.rcpt_to) return rcpt_domains;

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

/*
 *                Inbound Processing
 *
 * Look for sender domains we can validate against something. Anything..
 *   FCrDNS, SPF, DKIM, verified TLS host name, etc..
 *
 * When verified / validated sender domains are found, check to see if
 * their recipients have ever sent mail to their domain.
*/

// early checks, on the mail hook
exports.is_authenticated = function (next, connection, params) {
  var plugin = this;

  // only validate inbound messages
  if (connection.relaying) return next();

  var sender_od = plugin.get_sender_domain_by_txn(connection.transaction);

  if (plugin.has_fcrdns_match(sender_od, connection)) {
    connection.logdebug(plugin, '+fcrdns: ' + sender_od);
    return next(null, null, sender_od);
  }
  if (plugin.has_spf_match(sender_od, connection)) {
    connection.logdebug(plugin, '+spf: ' + sender_od);
    return next(null, null, sender_od);
  }

  // Maybe: TLS verified domain?

  return next();
}

exports.get_validated_sender_od = function (connection) {
  var plugin = this;
  if (!connection) return;
  if (!connection.transaction) return;
  var txn_res = connection.transaction.results.get(plugin.name);
  if (!txn_res) return;
  return txn_res.sender;
}

exports.get_rcpt_ods = function (connection) {
  var plugin = this;
  if (!connection) return [];
  if (!connection.transaction) return [];

  var txn_r = connection.transaction.results.get(plugin.name);
  if (!txn_r) return [];

  return txn_r.rcpt_ods;
}

function already_matched (connection) {
  var res = connection.transaction.results.get(this);
  if (!res) return false;
  return (res.pass && res.pass.length) ? true : false;
}

exports.check_recipient = function (next, connection, rcpt) {
  var plugin = this;
  // rcpt is a valid local email address. Some rcpt_to.* plugin has
  // accepted it.

  // inbound only
  if (connection.relaying) return next();

  function errNext (err) {
    connection.logerror(plugin, 'check_recipient: ' + err);
    next();
  }

  if (!rcpt.host) return errNext('rcpt.host unset?');

  // reduce the host portion of the email address to an OD
  var rcpt_od = tlds.get_organizational_domain(rcpt.host);
  if (!rcpt_od) return errNext('no rcpt od for ' + rcpt.host);

  connection.transaction.results.push(plugin, { rcpt_ods: rcpt_od });

  // if no validated sender domain, there's nothing to do...yet
  var sender_od = plugin.get_validated_sender_od(connection);
  if (!sender_od) return next();

  // The sender OD is validated, check Redis for a match
  plugin.db.hget(rcpt_od, sender_od, function (err, reply) {
    if (err) {
      plugin.logerror(err);
      return next();
    }
    connection.logdebug(plugin, rcpt_od + ' : ' + sender_od + ' : ' + reply);
    if (reply) {
      connection.transaction.results.add(plugin, { pass: rcpt_od, count: reply });
    }
    return next(null, null, rcpt_od);
  });
}

exports.is_dkim_authenticated = function (next, connection) {
  var plugin = this;
  if (connection.relaying) return next();

  var rcpt_ods = [];

  function errNext (err) {
    connection.logerror(plugin, 'is_dkim_authenticated: ' + err);
    return next(null, null, rcpt_ods);
  }

  if (already_matched(connection)) return errNext('already matched');

  var sender_od = plugin.get_validated_sender_od(connection);
  if (!sender_od) return errNext('no sender_od');

  rcpt_ods = plugin.get_rcpt_ods(connection);
  if (!rcpt_ods || ! rcpt_ods.length) return errNext('no rcpt_ods');

  var dkim = connection.transaction.results.get('dkim_verify');
  if (!dkim) return next();
  if (!dkim.pass || !dkim.pass.length) return errNext('no dkim pass');

  var multi = plugin.db.multi();

  for (let i = 0; i < dkim.pass.length; i++) {
    var dkim_od = tlds.get_organizational_domain(dkim.pass[i]);
    if (dkim_od === sender_od) {
      connection.transaction.results.add(plugin, { sender: sender_od, auth: 'dkim' });
      for (let j = 0; j < rcpt_ods.length; j++) {
        multi.hget(rcpt_ods[j], sender_od);
      }
    }
  }

  multi.exec(function (err, replies) {
    if (err) {
      connection.logerror(plugin, err);
      return errNext(err);
    }

    for (let j = 0; j < rcpt_ods.length; j++) {
      if (replies[j]) {
        connection.transaction.results.add(plugin, {
          pass: rcpt_ods[j],
          count: replies[j],
          emit: true
        });
      }
    }
    return next(null, null, rcpt_ods);
  });
}

exports.has_fcrdns_match = function (sender_od, connection) {
  var plugin = this;
  var fcrdns = connection.results.get('fcrdns');
  if (!fcrdns) return false;
  if (!fcrdns.fcrdns) return false;

  connection.logdebug(plugin, fcrdns.fcrdns);

  var mail_host = fcrdns.fcrdns;
  if (Array.isArray(mail_host)) mail_host = fcrdns.fcrdns[0];

  var fcrdns_od = tlds.get_organizational_domain(mail_host);
  if (fcrdns_od !== sender_od) return false;

  connection.transaction.results.add(plugin, {
    sender: sender_od, auth: 'fcrdns', emit: true
  });
  return true;
}

exports.has_spf_match = function (sender_od, connection) {
  var plugin = this;

  var spf = connection.results.get('spf');
  if (spf && spf.domain && spf.result === 'Pass') {
    // scope=helo (HELO/EHLO)
    if (tlds.get_organizational_domain(spf.domain) === sender_od) {
      connection.transaction.results.add(plugin, {sender: sender_od});
      return true;
    }
  }

  spf = connection.transaction.results.get('spf');
  if (spf && spf.domain && spf.result === 'Pass') {
    // scope=mfrom (HELO/EHLO)
    if (tlds.get_organizational_domain(spf.domain) === sender_od) {
      connection.transaction.results.add(plugin, {
        sender: sender_od, auth: 'spf', emit: true
      });
      return true;
    }
  }

  return false;
}
