'use strict';

const tlds = require('haraka-tld');

exports.register = function () {
  this.inherits('haraka-plugin-redis');

  this.load_sender_ini();

  this.register_hook('init_master',  'init_redis_plugin');
  this.register_hook('init_child',   'init_redis_plugin');

  this.register_hook('mail',       'is_authenticated');
  this.register_hook('rcpt_ok',    'check_recipient');
  this.register_hook('queue_ok',   'update_sender');
  this.register_hook('data_post',  'is_dkim_authenticated');
}

exports.load_sender_ini = function () {
  const plugin = this;

  plugin.cfg = plugin.config.get('known-senders.ini', function () {
    plugin.load_sender_ini();
  });

  if (plugin.cfg.ignored_ods === undefined) plugin.cfg.ignored_ods = {}

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

exports.update_sender = async function (next, connection, params) {
  const plugin = this;
  // queue_ok arguments: next, connection, msg
  // ok 1390590369 qp 634 (F82E2DD5-9238-41DC-BC95-9C3A02716AD2.1)

  let sender_od;
  let rcpt_domains;

  function errNext (err) {
    connection.logerror(plugin, `update_sender: ${err}`);
    next(null, null, sender_od, rcpt_domains);
  }

  // connection.loginfo(this, params);
  if (!connection) return errNext('no connection');
  if (!connection.transaction) return errNext('no transaction');
  if (!connection.relaying) return next();
  const txn = connection.transaction;

  sender_od = this.get_sender_domain_by_txn(txn);
  if (!sender_od) return errNext('no sender domain');
  if (sender_od in plugin.cfg.ignored_ods) return errNext(`ignored(${sender_id})`);

  rcpt_domains = this.get_recipient_domains_by_txn(txn);
  if (rcpt_domains.length === 0) {
    return errNext(`no rcpt ODs for ${sender_od}`);
  }

  // within this function, the sender is a local domain
  // and the recipient is an external domain
  try {
    const multi = this.db.multi();
    for (const rcptDomain of rcpt_domains) {
      multi.hIncrBy(sender_od, rcptDomain, 1);
    }

    const replies = await multi.exec()
    for (let i = 0; i < rcpt_domains.length; i++) {
      connection.loginfo(this, `saved ${sender_od} : ${rcpt_domains[i]} : ${replies[i]}`);
    }
    next(null, null, sender_od, rcpt_domains);
  }
  catch (err) {
    connection.logerror(this, err);
    next();
  }
}

exports.get_sender_domain_by_txn = function (txn) {
  if (!txn.mail_from || !txn.mail_from.host) return;
  const sender_od = tlds.get_organizational_domain(txn.mail_from.host);
  if (txn.mail_from.host !== sender_od) {
    this.logdebug(`sender: ${txn.mail_from.host} -> ${sender_od}`);
  }
  return sender_od;
}

exports.get_recipient_domains_by_txn = function (txn) {
  const plugin = this;

  const rcpt_domains = [];
  if (!txn.rcpt_to) return rcpt_domains;

  for (const element of txn.rcpt_to) {
    if (!element.host) continue;
    const rcpt_od = tlds.get_organizational_domain(element.host);
    if (element.host !== rcpt_od) {
      plugin.loginfo(`rcpt: ${element.host} -> ${rcpt_od}`);
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

  // only validate inbound messages
  if (connection.relaying) return next();

  const sender_od = this.get_sender_domain_by_txn(connection.transaction);
  if (sender_od in this.cfg.ignored_ods) return next()

  if (this.has_fcrdns_match(sender_od, connection)) {
    connection.logdebug(this, `+fcrdns: ${sender_od}`);
    return next(null, null, sender_od);
  }
  if (this.has_spf_match(sender_od, connection)) {
    connection.logdebug(this, `+spf: ${sender_od}`);
    return next(null, null, sender_od);
  }

  // Maybe: TLS verified domain?
  if (connection.tls.verified) {
    // TODO: get the CN and Subject Alternative Names of the cert
    // then look for match with sender_od
    connection.logdebug(this, `+tls: ${sender_od}`);
    // return next(null, null, sender_od);
  }

  next();
}

exports.get_validated_sender_od = function (connection) {
  if (!connection || !connection.transaction) return;
  const txn_res = connection.transaction.results.get(this.name);
  if (!txn_res) return;
  return txn_res.sender;
}

exports.get_rcpt_ods = function (connection) {
  if (!connection) return [];
  if (!connection.transaction) return [];

  const txn_r = connection.transaction.results.get(this.name);
  if (!txn_r) return [];

  return txn_r.rcpt_ods;
}

exports.already_matched = function (connection) {
  const res = connection.transaction.results.get(this);
  if (!res) return false;
  return (res.pass && res.pass.length) ? true : false;
}

exports.check_recipient = async function (next, connection, rcpt) {
  // rcpt is a valid local email address. Some rcpt_to.* plugin has
  // accepted it.

  // inbound only
  if (connection.relaying) return next();

  function errNext (err) {
    connection.logerror(this, `check_recipient: ${err}`);
    next();
  }

  if (!rcpt.host) return errNext('rcpt.host unset?');

  // reduce the host portion of the email address to an OD
  const rcpt_od = tlds.get_organizational_domain(rcpt.host);
  if (!rcpt_od) return errNext(`no rcpt od for ${rcpt.host}`);

  connection.transaction.results.push(this, { rcpt_ods: rcpt_od });

  // if no validated sender domain, there's nothing to do...yet
  const sender_od = this.get_validated_sender_od(connection);
  if (!sender_od) return next();
  if (sender_od in this.cfg.ignored_ods) return errNext(`ignored(${sender_id})`)

  // The sender OD is validated, check Redis for a match
  try {
    const reply = await this.db.hGet(rcpt_od, sender_od)
    connection.logdebug(this, `${rcpt_od} : ${sender_od} : ${reply}`);
    if (reply) {
      connection.transaction.results.add(this, { pass: rcpt_od, count: reply });
    }
    next(null, null, rcpt_od);
  }
  catch (err) {
    this.logerror(err);
    next();
  }
}

exports.is_dkim_authenticated = async function (next, connection) {
  const plugin = this
  if (connection.relaying) return next();

  let rcpt_ods = [];

  function errNext (err) {
    connection.logerror(plugin, `is_dkim_authenticated: ${err}`);
    next(null, null, rcpt_ods);
  }
  function infoNext (msg) {
    connection.loginfo(plugin, `is_dkim_authenticated: ${msg}`);
    next(null, null, rcpt_ods);
  }

  if (this.already_matched(connection)) return infoNext('already matched');

  const sender_od = this.get_validated_sender_od(connection);
  if (!sender_od) return errNext('no sender_od');
  if (sender_od in this.cfg.ignored_ods) return infoNext(`ignored(${sender_id})`)

  rcpt_ods = this.get_rcpt_ods(connection);
  if (!rcpt_ods || ! rcpt_ods.length) return errNext('no rcpt_ods');

  const dkim = connection.transaction.results.get('dkim_verify');
  if (!dkim) return infoNext('no dkim_verify results');
  if (!dkim.pass || !dkim.pass.length) return infoNext('no dkim pass')

  try {
    const multi = this.db.multi();

    for (const pas of dkim.pass) {
      const dkim_od = tlds.get_organizational_domain(pas);
      if (dkim_od === sender_od) {
        connection.transaction.results.add(this, { sender: sender_od, auth: 'dkim' });
        for (const rcptOd of rcpt_ods) {
          multi.hGet(rcptOd, sender_od);
        }
      }
    }

    const replies = await multi.exec()
    for (let j = 0; j < rcpt_ods.length; j++) {
      if (!replies[j]) continue
      connection.transaction.results.add(this, {
        pass: rcpt_ods[j],
        count: replies[j],
        emit: true
      });
    }
    next(null, null, rcpt_ods);
  }
  catch (err) {
    connection.logerror(this, err)
    errNext(err)
  }
}

exports.has_fcrdns_match = function (sender_od, connection) {
  const fcrdns = connection.results.get('fcrdns');
  if (!fcrdns) return false;
  if (!fcrdns.fcrdns) return false;

  connection.logdebug(this, fcrdns.fcrdns);

  let mail_host = fcrdns.fcrdns;
  if (Array.isArray(mail_host)) mail_host = fcrdns.fcrdns[0];

  const fcrdns_od = tlds.get_organizational_domain(mail_host);
  if (fcrdns_od !== sender_od) return false;

  connection.transaction.results.add(this, {
    sender: sender_od, auth: 'fcrdns', emit: true
  });
  return true;
}

exports.has_spf_match = function (sender_od, connection) {

  let spf = connection.results.get('spf');
  if (spf && spf.domain && spf.result === 'Pass') {
    // scope=helo (HELO/EHLO)
    if (tlds.get_organizational_domain(spf.domain) === sender_od) {
      connection.transaction.results.add(this, {sender: sender_od});
      return true;
    }
  }

  spf = connection.transaction.results.get('spf');
  if (spf && spf.domain && spf.result === 'Pass') {
    // scope=mfrom (HELO/EHLO)
    if (tlds.get_organizational_domain(spf.domain) === sender_od) {
      connection.transaction.results.add(this, {
        sender: sender_od, auth: 'spf', emit: true
      });
      return true;
    }
  }

  return false;
}
