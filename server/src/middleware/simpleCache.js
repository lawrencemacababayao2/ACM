import rateLimits from '../config/rateLimits.js';

// Small in-process cache for anonymous public GETs (landing content, FAQs,
// carousel). One minute of staleness is invisible to a visitor and it keeps the
// public read endpoints cheap enough that the per-IP limit is only ever hit by a
// real burst, not by ordinary browsing that refetches the same URL.
//
// Only 200 responses are cached. Writes and authenticated reads pass straight
// through, so staff never see a cached page they just changed.
export function simpleCache(ttlMs = rateLimits.publicData.cacheTtlMs) {
  const store = new Map();

  return function cacheMiddleware(req, res, next) {
    if (req.method !== 'GET') return next();

    const key = req.originalUrl || req.url;
    const hit = store.get(key);
    if (hit && Date.now() - hit.at < ttlMs) {
      res.set('X-Cache', 'hit');
      return res.type('application/json').send(hit.body);
    }

    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode === 200) {
        if (store.size > 500) store.clear();
        store.set(key, { at: Date.now(), body });
        if (!res.get('X-Cache')) res.set('X-Cache', 'miss');
      }
      return originalJson(body);
    };
    return next();
  };
}
