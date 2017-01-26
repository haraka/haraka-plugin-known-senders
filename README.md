# haraka-plugin-known-senders

[![Build Status][ci-img]][ci-url]
[![Code Climate][clim-img]][clim-url]
[![Greenkeeper badge][gk-img]][gk-url]


[![NPM][npm-img]][npm-url]

Increase the reputation of domains you send email to.


## How it works

This plugin inspects outgoing emails and adds the destination domains to a known senders database. When emails arrive from those known senders, this plugin stores a result object noting that.

### TL;DR

Outgoing messages are determined by inspecting the `relaying` property of the connection. If `relaying=true`, then the connection has been extended a form of trust, usually via AUTH credentials or IP ACLs. In those outbound emails, the sender domain and recipient domains are parsed and a redis entry is inserted/updated.

When emails later arrive from a domain your users have sent email to, the redis DB is checked and if a match is found, a result object is stored in the transaction results. That result can be scored by reputation engines like
 [karma](https://github.com/haraka/haraka-plugin-karma) and used to affect the messages deliverability.

Such a karma rule would look like this:

`280 = known-senders | pass      | equals | wks          |  5  | Known Sender`


## Authentication

Inbound messages are only checked against the known-senders list when the sender's Organizational Domain can be validated against a form of domain authentication.

There has several authentication mechanisms that can validate that a sending host has authority to send on behalf of the [purported] domain:

- FCrDNS: [Forward Confirmed reverse DNS](https://en.wikipedia.org/wiki/Forward-confirmed_reverse_DNS)
- SPF: [Sender Policy Framework](https://en.wikipedia.org/wiki/Sender_Policy_Framework)
- DKIM: [DomainKeys Identified Mail](https://en.wikipedia.org/wiki/DomainKeys_Identified_Mail)


## Ideas for additional authentication mechanisms

Mechanisms need not be 100% effective to be useful.

- TLS certficate names
- GeoLocation



[ci-img]: https://travis-ci.org/haraka/haraka-plugin-known-senders.svg
[ci-url]: https://travis-ci.org/haraka/haraka-plugin-known-senders
[cov-img]: https://codecov.io/github/haraka/haraka-plugin-known-senders/coverage.svg
[cov-url]: https://codecov.io/github/haraka/haraka-plugin-known-senders
[clim-img]: https://codeclimate.com/github/haraka/haraka-plugin-known-senders/badges/gpa.svg
[clim-url]: https://codeclimate.com/github/haraka/haraka-plugin-known-senders
[gk-img]: https://badges.greenkeeper.io/haraka/haraka-plugin-known-senders.svg
[gk-url]: https://greenkeeper.io/
[npm-img]: https://nodei.co/npm/haraka-plugin-known-senders.png
[npm-url]: https://www.npmjs.com/package/haraka-plugin-known-senders