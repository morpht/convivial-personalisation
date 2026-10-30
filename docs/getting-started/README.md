# Getting started

Load the browser bundle, create an engine with your JSON configuration and call `collect()` to run its pipelines. Each pipeline chooses its sources, processors and destinations. Learned profiles and content ranking are optional.

```html
<script src="/libraries/convivial-personalisation/bundle.js"></script>
<script type="module" src="/js/personalisation.js"></script>
```

These are example public paths; adjust them to your site. Load the bundle before the initializer. The library runs in the browser; Node.js is needed only to build it from source.

- [Add the library to your site](../usage/browser.md): get the bundle, attach it and start collection.
- [Collect and publish a value](installation.md): a short initializer using a URL parameter, a dimension and a destination.
- [Profiler configuration](../configuration/profilers.md): define your own pipelines.

Use [Usage](../usage/README.md) for integration examples and [Reference](../reference/README.md) for individual methods and plugin options.
