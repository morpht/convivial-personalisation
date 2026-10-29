# Consent and data handling

The library exposes controls for personalisation, browser persistence, cookies and analytics. Your integration connects these controls to the site's consent interface.

## Defaults

```json
{
  "privacy": {
    "consent_default": "granted",
    "respect_gpc": true,
    "cookies": false,
    "cookie_days": 365
  },
  "analytics": {
    "events": true,
    "datalayer": "dataLayer"
  }
}
```

The default model enables personalisation unless a saved denial or Global Privacy Control disables it. Use `consent_default: 'denied'` when the site should wait for an explicit choice. Cookies remain disabled unless separately enabled.

## Connect the visitor's choice

```javascript
engine.consent('granted');
engine.consent('denied');
console.log(engine.personalised, engine.consentState);
```

Accepted states are `'granted'` and `'denied'`. An unrecognised value just returns the current state. When GPC is respected and active, the state is `'gpc'` and a grant cannot override it.

The saved preference uses the origin-wide key `convivial_personalisation_consent`, so engines on the same origin share that saved choice. Denial erases learned state and tracked published keys and disables persistence. Granting enables future learning and allowed persistence; it does not restore erased history or automatically recollect the page.

## What happens without personalisation

Collection can still prepare temporary metadata and in-memory outputs. Profile folds are skipped. Ranking uses no learned vectors, seen history, suppressions or dimension interests. The current-page filter still applies, and eligible fallback rows can be returned. With `fallback: 'none'`, there will be no results when no vectors are used.

`publish()` keeps an output in memory when its local-storage target is enabled, so components should read through `published()`. Cookie publication additionally requires consent, `privacy.cookies: true`, the cookie target and engine persistence.

## Persistence and data flow

`persist: false` prevents normal profile and output persistence; it is useful for examples. It is not a consent decision: an in-memory engine can still learn and rank while consent is granted. The explicit `consent()` method can store a consent preference, and denial or construction under denied consent can erase previously stored state for the same site ID.

The core matching and ranking work happens in the browser and does not send profile vectors to a recommendation service. Configured `get` sources do make HTTP requests. Analytics methods and destinations can push data into the configured data layer; external tag-manager consumers may send those events elsewhere. Disabling analytics does not cancel configured HTTP sources.

For a demo, use a distinct site ID with `{ persist: false }` and `analytics.events: false`. This keeps new profile data in memory and disables data-layer events. Use synthetic metadata when testing.

## Erasure and transparency

`engine.snapshot()` reports the version, consent, profile confidence, dimensions, seen count, suppressions and block summaries. It does not send the snapshot anywhere. `engine.erase()` removes site state and tracked outputs without changing the stored consent preference.

Debug mode can include collected values and vectors in the browser console. Enable it only when needed and disable it after diagnosis.
