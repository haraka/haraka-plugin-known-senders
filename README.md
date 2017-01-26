# haraka-plugin-known-senders

[![Greenkeeper badge](https://badges.greenkeeper.io/haraka/haraka-plugin-known-senders.svg)](https://greenkeeper.io/)

Increase the reputation of domains you send email to.


## How it works

This plugin inspects outgoing emails and adds the destination domains to a known senders database. When emails arrive from those known senders, this plugin stores a result object noting that.

### TL;DR

Outgoing messages are determined by inspecting the `relaying` property of the connection. If `relaying=true`, then the connection has been extended a form of trust, usually via AUTH credentials or IP ACLs. In those outbound emails, the sender domain and recipient domains are parsed and a redis entry is inserted/updated.

When emails later arrive from a domain your users have sent email to, the redis DB is checked and if a match is found, a result object is stored in the transaction results. That result can be scored by reputation engines like
 [karma](https://github.com/haraka/haraka-plugin-karma) and used to affect the messages deliverability.


# MULTI-TENANCY

This plugin can operate in two contexts where the incoming sender is validated against:

    * global: a list of every domain every email user on your system send mail to
    * domain: a list of only domains where users of that domain sent email to

## PROS AND CONS

* Using global context uses much database storage
* Incidental enrichment: If Haraka only has a few domains, using the global context seems the right choice. There won't be many edge cases where weird uncle Harold replied to a spam from buy-now@hang-to-your-knees.com and now more of your users get spam from that oh-so-savory and reputable domain.
* On a mail server with many hundreds or thousands of domains, the accidental / incidental hits are expected.


## Counters

- domain
    - fcrdns: INT
    - spf:    INT
    - dkim:   INT
    - dmarc:  INT


## Authentication

Email has several authentication mechanisms that can validate that a sending host has authority to send on behalf of the [purported] domain:

- FCrDNS: [Forward Confirmed reverse DNS](https://en.wikipedia.org/wiki/Forward-confirmed_reverse_DNS)
- SPF: [Sender Policy Framework](https://en.wikipedia.org/wiki/Sender_Policy_Framework)
- DKIM: [DomainKeys Identified Mail](https://en.wikipedia.org/wiki/DomainKeys_Identified_Mail)
