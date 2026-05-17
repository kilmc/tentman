---
_tentmanId: tent_01KTVA0B0VT000000000000005
title: 'Designing a reliable fixture'
slug: 'designing-a-reliable-fixture'
date: '2026-04-11'
author: 'Tentman Team'
coverImage: '/images/posts/fixture-grid.svg'
excerpt: 'A useful fixture is quiet, repeatable, and varied enough that new features have somewhere real to land.'
published: true
---

## Start with surfaces people actually use

The best fixture is not the fanciest one. It is the one that makes regressions easy to spot and still reflects the kinds of pages people actually build.

- singleton pages for stable copy
- a directory-backed blog collection
- one nested collection surface
- one reusable block
- one content component example

## Keep the frontend intentionally plain

If something breaks in the content model, the site should not be stylish enough to hide it. That is why this app stays monochrome and compact.

## What we learn from this

Once this exists, a new Tentman feature can be checked against a small but believable site instead of a synthetic parser example.
