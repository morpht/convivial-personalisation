# Destinations

Destinations run after a pipeline's processors with `(engine, profiler, destination, values)`. Publishing destinations use `target_key` and `target_location: { localstorage: true, cookie: false }` unless they derive their own key. Targets must be enabled explicitly. Cookie writes also require consent and `privacy.cookies: true`. Data-layer and form operations have their own options.

## `bestpick`

Publishes the first non-empty published key in a priority list.

`storage_keys`: published key names, in priority order. `default_value` can supply a fallback. Empty values and the strings `null` and `undefined` are ignored. `remove_empty` removes the output when no usable choice exists.

## `copy`

Reads an internal path and publishes its value.

`storage_key`: path such as `temp.topics` or `store.choice.value`. `stringify` enables JSON encoding; otherwise arrays join with commas. `remove_empty` removes a missing output.

## `datalayer_event`

Emits one `convivialProfiler.event` data-layer event per input.

`category`, `action` and optional `normalize` set the event fields. Labels use the input, JSON-encoding objects; value is `1` or `1 / input count`. Events honour analytics and consent controls.

## `flag`

Builds an output key by surrounding an internal value with a prefix and suffix, then publishes the key as its own value.

`storage_key`, optional `flag_prefix` and `flag_suffix`. Uses the configured target locations; it derives the key instead of using `target_key`.

## `formfiller`

Fills matching input fields from published values or cookies.

`form_selector` is appended to `form`; `fields_selector` contains `fieldName|storageName` strings. `storage_source.localstorage` reads via `engine.published()` and `storage_source.cookie` allows a cookie fallback. Cookie reading is an explicit source choice, separate from cookie publication. It does not submit the form.

## `formtracker`

Attaches a submit listener once to the selected form and pushes a data-layer event using one field value.

`form_selector`, `field_name`, `event_category`, `event_action`. Emits `convivialProfiler.event` through the consent-aware event method. Choose synthetic, non-sensitive inputs for tests.

## `officehours`

Publishes `1` when any configured day/hour window matches, otherwise `0`.

Use an IANA `timezone` such as `Australia/Sydney`, and `office_times` entries with `day` (Sunday `0` through Saturday `6`), `start` and `close`. Bounds are inclusive whole hours, so close `17` includes the 17th hour. The implementation also accepts date-window offset fields, but named timezones handle seasonal changes without annually maintained dates.

## `range`

Maps a stored numeric value to the first matching numeric range.

`storage_key`, `ranges: [{ min, max, key }]`; lower bound inclusive, upper bound exclusive. A numeric value with no match leaves the existing output unchanged. `remove_empty` applies when the input is not a usable number.

## `remove`

Removes published output keys named by internal values and static strings.

`storage_keys` are internal paths whose values contain output names; `static_values` supplies direct names. Selected target locations determine which outputs are removed.

## `season`

Publishes a season using the current month and a latitude-like value.

`storage_key` supplies the value. Negative values shift the northern month mapping by six months. This is a coarse hemisphere rule, not a location-specific seasonal model. `remove_empty` removes output when input is missing.

## `set`

Reads an internal value as the name of a published key and sets that key to `1`.

`storage_key` provides the output name; target locations control publication.

## `unset`

Reads an internal value as the name of a published key and sets that key to `0`.

`storage_key` provides the output name. This publishes zero; use `remove` to delete a key.

## `threshold`

Publishes a configured value when the stored number is at least the threshold.

`storage_key`, `threshold_number`, `target_value`. `remove_empty` removes the output when the test fails, including a missing or non-numeric input.

## `top`

Publishes the leading value in a dimension, optionally requiring a clear lead.

`dimension` names the counter group. `min_confidence` compares the leading margin divided by the top count; when too low, publishes `mixed_value` or `mixed`. `default_value` handles an empty dimension; otherwise `remove_empty` can delete the output. `dimension_key` also accepts an internal `dimensions.<name>` path.

## `tops`

Publishes the highest-count values in a dimension.

`dimension`, `length` (default `3`), `default_value` as a comma list, `stringify` for JSON output; otherwise joins with commas. `remove_empty` can remove an empty result. Accepts `dimension_key` as well.
