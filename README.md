[![Build Status][ci-img]][ci-url]
[![Code Climate][clim-img]][clim-url]

# haraka-plugin-known-senders

Increase the reputation of domains you exchange email with by sending them email.

## Synopsis

Known Senders is based on the premise that domains users send email to are domains they also want to receive email from. By maintaining lists of domains that local users send email to, a weak but helpful form of trust is obtained.

## How it works

This plugin inspects outgoing emails and adds the destination domains to a known senders database. When emails arrive from those known sending domains, this plugin stores a result object with the passing domain(s) name.

### TL;DR

Outgoing messages are determined by inspecting the `relaying` property of the connection. If `relaying=true`, then the connection has been extended a form of trust, usually via AUTH credentials or IP ACLs. In those outbound emails, the sender domain and recipient domains are reduced to Organizational Domains and a redis entry is inserted/updated.

When emails later arrive from a domain your users have sent email to, the redis DB is checked and if a match is found, a result object is stored in the transaction results. That result can be scored by reputation engines like [karma](https://github.com/haraka/haraka-plugin-karma) and used to affect the messages deliverability.

Such a karma rule would look like this:

`280 = known-senders | pass      | length | gt 0    |  5  | Known Sender`


## Authentication

Inbound messages are only checked against the known-senders list when the sender's Organizational Domain can be validated against a form of domain authentication.

The current authentication mechanisms that can validate that a sending host has authority to send on behalf of the [purported] sending domain are:

- FCrDNS: [Forward Confirmed reverse DNS](https://en.wikipedia.org/wiki/Forward-confirmed_reverse_DNS)
- SPF: [Sender Policy Framework](https://en.wikipedia.org/wiki/Sender_Policy_Framework)
- DKIM: [DomainKeys Identified Mail](https://en.wikipedia.org/wiki/DomainKeys_Identified_Mail)


## Ideas for additional authentication mechanisms

Mechanisms need not be 100% effective to be useful.

- TLS certficate names
- GeoLocation


## Limitations

This plugin can boost the reputation of most marginally deliverable ham. Where it doesn't help is for messages coming from a Windows Exchange server (no DKIM signing support without $$$ 3rd party plugin) on a lame ISPs network that doesn't let them configure reverse DNS and whose admins haven't the clue to set up SPF properly.



[ci-img]: https://github.com/haraka/haraka-plugin-known-senders/actions/workflows/ci.yml/badge.svg
[ci-url]: https://github.com/haraka/haraka-plugin-known-senders/actions/workflows/ci.yml
[clim-img]: https://codeclimate.com/github/haraka/haraka-plugin-known-senders/badges/gpa.svg
[clim-url]: https://codeclimate.com/github/haraka/haraka-plugin-known-senders
