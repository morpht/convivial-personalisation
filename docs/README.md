# Introduction

*Library version 1.0.0*

Clientside personalisation engine for building profiles and ranking content.

Convivial Personalisation learns a visitor's interests from page metadata. The site supplies candidate content, and the library uses the visitor's fast and slow profiles to choose recommendations.

A visitor reading gardening pages builds an interest in gardening. If they later read about transport, the fast profile responds to that change while the slow profile retains more of the earlier interest. The site can use both when choosing recommendations.

This guide is for developers and site builders:

- [Getting started](getting-started/README.md): add the library to your site or try the local examples.
- [Concepts and tools](concepts-and-tools/README.md): how collection, profiles, matching, storage and consent work together.
- [Configuration](configuration/README.md): connect page metadata to the fields used for learning and ranking.
- [Usage](usage/README.md): rank content, build recommendation blocks and integrate with Drupal.
- [Reference](reference/README.md): JavaScript methods, `rank()` options, sources, processors and destinations.
- [Support](support/README.md): diagnose unexpected results and get help from Morpht.

## Conventions

- Code names and settings are written as `rank()`, `profile.fields` and `temp.topics`.
- Button labels are written in **bold**. Commands run from the repository root unless stated otherwise.
- Durations are in seconds unless another unit is given. Example values are identified separately from library defaults.

## Examples

Start with the [gardening example](getting-started/installation.md), then compare fast and slow profiles in the [cats, dogs and birds example](usage/fast-and-slow.md). Both use synthetic content, keep profile data in memory and disable analytics.

The examples run locally with Node.js 22.12 or newer and npm. Drupal is needed only for the [Drupal integration](usage/drupal.md).
