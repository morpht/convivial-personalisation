export const candidates = [
  { nid: 'cat-guide', title: 'Cat care', description: 'Caring for cats and kittens', keywords: 'cats, kittens, feline', topics: 'cp-topic-cats', audiences: 'cp-audience-cats', intent: 'intent-needs-recommendations', campaign: 'cp-cats-fast', stage: 'stage-discovery', type: 'article', url: '/guides/cats' },
  { nid: 'dog-guide', title: 'Dog care', description: 'Caring for dogs and puppies', keywords: 'dogs, puppies, canine', topics: 'cp-topic-dogs', audiences: 'cp-audience-dogs', intent: 'intent-needs-recommendations', campaign: 'cp-dogs-slow', stage: 'stage-discovery', type: 'article', url: '/guides/dogs' },
  { nid: 'bird-guide', title: 'Bird care', description: 'Caring for birds', keywords: 'birds', topics: 'cp-topic-birds', audiences: 'cp-audience-birds', intent: 'intent-needs-recommendations', campaign: 'cp-birds', stage: 'stage-discovery', type: 'article', url: '/guides/birds' },
];

export function setPageMetadata(item) {
  const metadata = {
    nid: 'training-' + item.nid,
    title: item.title,
    description: item.description,
    keywords: item.keywords,
    topic: item.topics,
    topic_key: item.topics,
    audience: item.audiences,
    audience_key: item.audiences,
    intent: item.intent,
    stage: item.stage,
    type: item.type,
  };
  for (const [name, content] of Object.entries(metadata)) {
    let meta = document.querySelector(`meta[name="${name}"]`);
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = name;
      document.head.append(meta);
    }
    meta.content = content;
  }
}

export async function runSiteExample(Engine, settings) {
  let now = 1000000;
  const engine = new Engine(structuredClone(settings.config), 'documentation-site-example', {
    persist: false,
    debug: false,
    now: () => now,
  });
  const originalUrl = location.href;
  try {
    for (const item of candidates.slice(0, 2)) {
      setPageMetadata(item);
      const url = new URL(originalUrl);
      url.search = new URLSearchParams({ campaign: item.campaign });
      history.replaceState(null, '', url);
      await engine.collect();
      // Explicit folds make the simulated browsing sequence deterministic.
      engine.fold();
      if (item === candidates[0]) now += 300;
    }
  } finally {
    history.replaceState(null, '', originalUrl);
  }
  const options = { priorityWeight: 0, diversify: false };
  return {
    engine,
    fast: engine.rank(structuredClone(candidates), ['fast'], 3, { ...options, block: 'fast-example' }),
    slow: engine.rank(structuredClone(candidates), ['slow'], 3, { ...options, block: 'slow-example' }),
    mixed: engine.rank(structuredClone(candidates), { fast: 2, slow: 1 }, 3, { ...options, block: 'mixed-example' }),
  };
}
