# Sources

Sources append inputs to a pipeline's shared values array. Their function signature is `(engine, profiler, source, values)`. A source may return a promise; processors wait for all sources in that pipeline.

## `acceptlang`

Reads the browser language, preserving the full tag such as `en-AU`. Falls back to `en`.

No extra options. Pair with `language_full` or `language_simple` to store the desired representation.

## `cookie`

Reads one non-empty cookie value.

`name`: cookie name. This reads an existing cookie; the publication setting `privacy.cookies` controls writing cookies, not this source.

## `get`

Fetches a JSON resource and appends the decoded response as one input. Returns a promise that collection awaits.

`resource_url`: URL. `credentials`: fetch credentials mode, default `same-origin`. Non-success responses and JSON errors are reported as source errors. Caching requires an appropriate processor and `deferred` pipeline; the source alone has no TTL.

## `httpuseragent`

Appends `mobile` or `desktop` using a browser user-agent pattern.

No extra options. This is a coarse signal, not a device capability test.

## `meta`

Appends the non-empty content of every matching metadata element.

`attribute_name`: exact meta `name`. For example, `topics` reads `<meta name="topics" content="gardening,transport">`. Use a list processor when values contain comma-separated keys.

## `query`

Reads both a query parameter and its bracket-list spelling, including repeated occurrences.

`param`: name such as `topic`; reads `topic` and `topic[]`. An empty or bare parameter becomes boolean `true`. It does not turn the string `false` into a boolean.

## `time`

Appends the browser-local hour, minute or second.

`part`: `hour`, `minute` or `second`. Unsupported parts add nothing. It reads the real browser clock, not the engine's injected `now` function.

## `document_part`

Reads document text or location data for page metadata.

`part`: `title`, `description`, `headings`, `path` or `url`. Headings use `main h1, main h2, article h1, article h2`, falling back to `h1`; `selector` overrides the heading selector. Pair with `temp` and a field included in the vector configuration.
