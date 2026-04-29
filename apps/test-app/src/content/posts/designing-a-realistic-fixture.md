---
title: 'Designing a realistic fixture app'
slug: 'designing-a-realistic-fixture'
date: '2026-03-18'
author: 'Kilian McMichael'
coverImage: '/images/posts/fixture-grid.svg'
excerpt: 'A small test site becomes much more useful once it includes singleton pages, a directory-backed blog, and a reusable gallery block.'
published: true
---

## Start with surfaces people actually use

A convincing fixture app needs more than a homepage and a lorem ipsum paragraph. We want a mix of content shapes so the CMS has something meaningful to exercise.

- singleton pages for stable marketing copy
- a directory-backed blog for repeatable entries
- a reusable gallery block for nested structured values

## Keep the frontend intentionally boring

The public site should render the content clearly without hiding problems behind too much abstraction. If something breaks in the content model, we should notice it right away.

## What we learn from this

Once a fixture app exists, every new Tentman change can be tested against content that feels close to a real small website instead of a synthetic parser example.
