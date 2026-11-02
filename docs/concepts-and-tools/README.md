# Concepts and tools

The engine runs profilers to collect inputs, process values and publish outputs. Each profiler defines those operations through its sources, processors and destinations. The engine holds shared state, including temporary fields, stored values, dimensions and optional learned profiles.

- [Profilers](profilers.md): sources, processors and destinations that define a unit of work.
- [Engine state](engine-state.md): temporary fields, stored values, dimensions, learned profiles and related state.
- [Profile decay and confidence](fast-and-slow-profiles.md): configure how learned interests change over time.
- [Content matching](content-vectors.md): align fields and choose relevant inputs.
- [Ranking and recommendations](ranking.md): selection controls, results and fallback.
- [Collection and learning lifecycle](data-pipelines.md): when to rank content as collection and learning finish.
- [Storage and expiry](storage-and-expiry.md): where values are stored and when they expire.
- [Consent and data handling](consent-and-data.md): how consent affects learning, persistence and analytics.
