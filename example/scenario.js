import { config, items } from './config.js';

export async function runExample(Engine, now) {
  const engine = new Engine(config, 'documentation-example', { persist: false, now });
  await engine.collect();
  // Make this isolated example deterministic; normal components use deferred learning.
  engine.fold();
  const ranked = engine.rank(structuredClone(items), ['fast', 'slow'], 3, {
    priorityWeight: 0,
    diversify: false,
    block: 'example-recommendations',
  });
  return { engine, ranked };
}
