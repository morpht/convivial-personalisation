# Getting started

Add the library to your site, or run the local examples to see how browsing changes recommendations. The source and browser bundle are in [morpht/convivial-personalisation](https://github.com/morpht/convivial-personalisation).

To load the library on a page, serve `dist/bundle.js` from your site and include it before your initializer:

```html
<script src="/libraries/convivial-personalisation/bundle.js"></script>
<script type="module" src="/js/personalisation.js"></script>
```

`bundle.js` is already minified. These are example public paths; adjust them to your site. The installation guide below shows where to put the configuration and what to write in `personalisation.js`.

- [Add the library to your site](../usage/browser.md): get the bundle, attach it to a page and start collection.
- [Your first recommendation](installation.md): build the library, learn a gardening interest and compare learned results with fallback.
- [Compare fast and slow recommendations](../usage/fast-and-slow.md): learn two pages five simulated minutes apart and see which interests remain in each profile.

The local examples use synthetic content and require Git, Node.js 22.12 or newer, npm and a modern browser. Once the library is loaded, use [Usage](../usage/README.md) to build recommendation components. [Concepts and tools](../concepts-and-tools/README.md) explains the results, and [Reference](../reference/README.md) lists individual settings.
