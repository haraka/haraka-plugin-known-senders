# haraka-plugin-domain-counters

[![Greenkeeper badge](https://badges.greenkeeper.io/haraka/haraka-plugin-domain-counters.svg)](https://greenkeeper.io/)

Increase the reputation of domains you send email to.


# How it works

When you[r users] send emails, this plugin will increment counters for each recipient domain.
When emails later arrive from domains your users have sent email to, reputation engines like
 [karma](https://github.com/haraka/haraka-plugin-karma) can observe this and boost their deliverability.


# PLAN

- for domains we send to, increment when the message is queued
- for domains we receive from, increment only when:
    - message has been queued

There's no attempt to validate outbound (sent) email domains.

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

Email has several authentication mechanisms that can validate that a sending host
has authority to send on behalf of the [purported] domain:

- FCrDNS: [Forward Confirmed reverse DNS](https://en.wikipedia.org/wiki/Forward-confirmed_reverse_DNS)
- SPF: [Sender Policy Framework](https://en.wikipedia.org/wiki/Sender_Policy_Framework)
- DKIM: [DomainKeys Identified Mail](https://en.wikipedia.org/wiki/DomainKeys_Identified_Mail)
