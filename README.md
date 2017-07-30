[![Build Status][ci-img]][ci-url]
[![Code Climate][clim-img]][clim-url]
[![Windows Build status][apv-img]][apv-url]
[![Greenkeeper badge][gk-img]][gk-url]
[![NPM][npm-img]][npm-url]

# haraka-plugin-known-senders

Increase the reputation of domains you send email to, simply by sending them email.

## Synopsis

Known Senders is based on the premise that domains users send email to are domains they also want to receive email from. By maintaining lists of domains that local users send email to, a weak but helpful form of automatic whitelisting is obtained.


## How it works

This plugin inspects outgoing emails and adds the destination domains to a known senders database. When emails arrive from those known senders, this plugin stores a result object with the passing domain(s) name.

### TL;DR

Outgoing messages are determined by inspecting the `relaying` property of the connection. If `relaying=true`, then the connection has been extended a form of trust, usually via AUTH credentials or IP ACLs. In those outbound emails, the sender domain and recipient domains are reduced to Organizational Domains and a redis entry is inserted/updated.

When emails later arrive from a domain your users have sent email to, the redis DB is checked and if a match is found, a result object is stored in the transaction results. That result can be scored by reputation engines like [karma](https://github.com/haraka/haraka-plugin-karma) and used to affect the messages deliverability.

Such a karma rule would look like this:

`280 = known-senders | pass      | length | gt 0    |  5  | Known Sender`


## Authentication

Inbound messages are only checked against the known-senders list when the sender's Organizational Domain can be validated against a form of domain authentication.

There has currently three authentication mechanisms that can validate that a sending host has authority to send on behalf of the [purported] sending domain:

- FCrDNS: [Forward Confirmed reverse DNS](https://en.wikipedia.org/wiki/Forward-confirmed_reverse_DNS)
- SPF: [Sender Policy Framework](https://en.wikipedia.org/wiki/Sender_Policy_Framework)
- DKIM: [DomainKeys Identified Mail](https://en.wikipedia.org/wiki/DomainKeys_Identified_Mail)


## Ideas for additional authentication mechanisms

Mechanisms need not be 100% effective to be useful.

- TLS certficate names
- GeoLocation


## Limitations

This plugin can boost the reputation of most marginally deliverable ham. Where it doesn't help is for messages coming from a Windows Exchange server (no DKIM signing support without $$$ 3rd party plugin) on a lame ISPs network that doesn't let them configure reverse DNS and whose admins haven't the clue to set up SPF properly.


nyet: [![Coverage Status][cov-img]][cov-url]


[ci-img]: https://travis-ci.org/haraka/haraka-plugin-known-senders.svg?branch=master
[ci-url]: https://travis-ci.org/haraka/haraka-plugin-known-senders
[cov-img]: https://codecov.io/github/haraka/haraka-plugin-known-senders/coverage.svg
[cov-url]: https://codecov.io/github/haraka/haraka-plugin-known-senders?branch=master
[clim-img]: https://codeclimate.com/github/haraka/haraka-plugin-known-senders/badges/gpa.svg
[clim-url]: https://codeclimate.com/github/haraka/haraka-plugin-known-senders
[apv-img]: https://ci.appveyor.com/api/projects/status/l6wgun9wp9lbhc4h/branch/master?svg=true
[apv-url]: https://ci.appveyor.com/project/msimerson/haraka-plugin-known-senders/branch/master
[gk-img]: https://badges.greenkeeper.io/haraka/haraka-plugin-known-senders.svg
[gk-url]: https://greenkeeper.io/
[npm-img]: https://nodei.co/npm/haraka-plugin-known-senders.png
[npm-url]: https://www.npmjs.com/package/haraka-plugin-known-senders
