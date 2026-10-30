# Introduction

*Library version 1.0.0*

Convivial Personalisation is a browser library for collecting visitor context, processing it and making the results available to site components.

The library collects data from metatags, URL parameters, cookies, document content, browser language, time and HTTP resources. It can retain state in local storage and read back published values. Builders define which inputs to collect and how to use them in JSON configuration.

## What it does

- Collect and transform values through configurable sources and processors.
- Count interests in dimensions such as topics or audiences, record page views and searches, and store values with expiry.
- Publish values to local storage or cookies, fill form fields and emit data-layer events through destinations.
- Optionally learn named profiles and use them to rank candidate content supplied by the site.

Collection, dimensions and destinations work without learned profiles. When a site uses profiles, the builder chooses their names, number and learning settings. Persistence, cookie publication and analytics follow the configured consent controls.

## Use the guide

- [Getting started](getting-started/README.md): load the library, configure a pipeline and use its output.
- [Concepts and tools](concepts-and-tools/README.md): collection, dimensions, optional profiles, storage and consent.
- [Configuration](configuration/README.md): define sources, processors, destinations and optional learning settings.
- [Usage](usage/README.md): publish audience choices, rank content and integrate with Drupal.
- [Reference](reference/README.md): JavaScript methods, options and built-in plugins.
- [Support](support/README.md): diagnose unexpected results and get help from Morpht.

## Conventions

- Code names and settings are written as `rank()`, `profile.fields` and `temp.topics`.
- Commands run from the repository root unless stated otherwise.
- Durations are in seconds unless another unit is given. Example values are identified separately from library defaults.
