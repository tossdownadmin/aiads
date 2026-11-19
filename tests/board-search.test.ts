import { afterEach, expect, it, vi } from 'vitest';
import { searchForeplay } from '../lib/competitors/foreplay';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

const input = { brandIds: [], boardId: 'board', boardAdvertisers: true, live: 'ACTIVE', format: 'ALL' } as const;
const payload = (data: unknown[]) => Response.json({ data });

it('uses the roster from Foreplay to request current ads', async () => {
  vi.stubEnv('FOREPLAY_API_KEY', 'example');
  const request = vi.fn().mockResolvedValueOnce(payload([{ id: 'brand' }])).mockResolvedValueOnce(payload([{ id: 'ad' }]));
  vi.stubGlobal('fetch', request);
  const result = await searchForeplay({ ...input, brandIds: [] });
  const adsUrl = request.mock.calls[1][0] as URL;
  expect(adsUrl.pathname).toBe('/api/brand/getAdsByBrandId');
  expect(adsUrl.searchParams.getAll('brand_ids')).toEqual(['brand']);
  expect(adsUrl.searchParams.get('live')).toBe('true');
  expect(result.creditCost).toBe(2);
});

it('returns an empty result without requesting ads for an empty board', async () => {
  vi.stubEnv('FOREPLAY_API_KEY', 'example');
  const request = vi.fn().mockResolvedValueOnce(payload([]));
  vi.stubGlobal('fetch', request);
  expect((await searchForeplay({ ...input, brandIds: [] })).ads).toEqual([]);
  expect(request).toHaveBeenCalledTimes(1);
});
