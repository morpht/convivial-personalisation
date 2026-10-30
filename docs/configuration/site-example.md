# Configuration example

This [example JSON](../assets/configuration/site-config.json) collects a page ID, title and topics, publishes a preferred topic, and optionally learns one profile named `interests`. Its four pipelines illustrate the configuration format; choose the inputs and settings for your site.

## Load the configuration

```javascript
const Engine = window.ConvivialPersonalisation.default;
const engine = new Engine(settings.config, settings.site);
await engine.collect();
```

Here `settings` is the downloaded JSON object, with `site` and `config` properties. The site ID separates this site's stored state. See [installation](../usage/browser.md) for loading the file.

## Metadata becomes flat candidate fields

| Page input | Temporary field / candidate property | Use |
| --- | --- | --- |
| `meta[name="nid"]` | `nid` | Stable item ID |
| `meta[name="title"]` | `title` | Text matching |
| `meta[name="topic"]` | `topics` | Topic matching and dimension counts |

For this example, supply candidates in the following shape:

```json
{
  "nid": "garden-guide",
  "title": "Growing a garden",
  "topics": "gardening",
  "url": "/guides/garden"
}
```

The singular `topic` metadata name maps to the plural `topics` candidate field. Other inputs, including query parameters and cookies, can use the same pipeline structure; see [sources](../reference/sources.md).

## Published output and optional learning

The topics pipeline uses a `dimension` processor and a `top` destination. Components read the leading topic with `engine.published('preferred_topic')`.

The final `learn` pipeline adds a profile named `interests` with a one-day half-life. Remove that pipeline if the site only needs collection and publishing. The profile name and half-life are example choices.

After learning, components can pass `['interests']` to `rank()`. Published values do not automatically filter candidates. See [rank content](../ranking/README.md) for a short call and its output.

## Before using it on a site

Set your own site ID, align page and candidate fields, and connect the site's consent interface. The example disables analytics and cookie publication and respects Global Privacy Control. See [consent and data handling](../concepts-and-tools/consent-and-data.md) for controls and defaults.
