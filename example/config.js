export const config = {
  profile: {
    fields: { title: 3, topics: 4 },
    text_fields: ['title'],
    id_field: 'nid',
    dims: 256,
  },
  data: {
    topics: { gardening: 'Gardening', transport: 'Transport' },
  },
  analytics: { events: false },
  profilers: {
    page_id: {
      sources: [{ type: 'meta', attribute_name: 'nid' }],
      processors: [{ type: 'temp', storage_key: 'nid' }],
    },
    page_title: {
      sources: [{ type: 'meta', attribute_name: 'title' }],
      processors: [{ type: 'temp', storage_key: 'title' }],
    },
    page_topics: {
      sources: [{ type: 'meta', attribute_name: 'topics' }],
      processors: [
        { type: 'temp_list', storage_key: 'topics' },
        { type: 'dimension', storage_key: 'topics', normalize: true },
      ],
    },
    learn: {
      processors: [
        { type: 'profile', storage_key: 'fast', decay: 86400 },
        { type: 'profile', storage_key: 'slow', decay: 31536000 },
      ],
    },
  },
};

export const items = [
  { nid: 'garden-tools', title: 'Choosing garden tools', topics: 'gardening', url: '/garden-tools' },
  { nid: 'bus-routes', title: 'Finding a bus route', topics: 'transport', url: '/bus-routes' },
  { nid: 'garden-seeds', title: 'Growing plants from seed', topics: 'gardening', url: '/garden-seeds' },
];
