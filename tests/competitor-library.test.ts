import { afterEach, expect, it, vi } from 'vitest';
import { advertiserIds, librarySchema, type ConfirmedCompetitor } from '../lib/competitors/library';
import { findForeplayBrands, searchForeplay, searchSavedCompetitors } from '../lib/competitors/foreplay';
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
const row=(id:string,pageIds?:string[]):ConfirmedCompetitor=>({id,name:id,domain:'',reviewed:true,...(pageIds?{brandIds:[],pageIds}:{})});
const filters={live:'ACTIVE',format:'ALL'} as const;
const response=(id:string,cursor?:string)=>Response.json({data:[{id,name:'Creative title',brand_id:'brand',description:'Copy',started_running:1795000000}],metadata:{cursor}});
it('keeps old brand mappings and treats Page-only rows as Page identities',()=>{
 expect(advertiserIds(row('legacy'))).toEqual({brands:['legacy'],pages:[]});
 expect(advertiserIds(row('uuid',['1234']))).toEqual({brands:[],pages:['1234']});
 expect(librarySchema.safeParse({competitors:[row('one',['1234']),row('two',['1234'])]}).success).toBe(false);
 expect(librarySchema.safeParse({competitors:[{...row('blank'),brandIds:[]}]}).success).toBe(false);
});
it('searches by advertiser name and preserves separate brand and Page IDs',async()=>{
 vi.stubEnv('FOREPLAY_API_KEY','test');const request=vi.fn().mockResolvedValue(Response.json({data:[{id:'foreplay-id',name:'CAVA',ad_library_id:'123456',url:'https://facebook.com/cava',websites:['https://cava.com']}]}));vi.stubGlobal('fetch',request);
 const found=await findForeplayBrands('CAVA','name');const url=request.mock.calls[0][0] as URL;
 expect(url.pathname).toBe('/api/discovery/brands');expect(url.searchParams.get('query')).toBe('CAVA');expect(found.candidates[0]).toMatchObject({brandIds:['foreplay-id'],pageIds:['123456'],domain:'cava.com'});
});
it('normalizes keyword results without calling the creative title an advertiser',async()=>{
 vi.stubEnv('FOREPLAY_API_KEY','test');const request=vi.fn().mockResolvedValue(response('ad'));vi.stubGlobal('fetch',request);
 const result=await searchForeplay({...filters,brandIds:[],query:'shawarma catering',force:true});const url=request.mock.calls[0][0] as URL;
 expect(url.pathname).toBe('/api/discovery/ads');expect(url.searchParams.has('force')).toBe(false);expect(result.ads[0].page_name).toBeUndefined();expect(result.ads[0].ad_name).toBe('Creative title');expect(result.ads[0].ad_delivery_start_time).toBe(new Date(1795000000000).toISOString());
});
it('resumes each Page independently, keeps confirmed names, and rejects stale search context',async()=>{
 vi.stubEnv('FOREPLAY_API_KEY','test');const request=vi.fn().mockResolvedValueOnce(response('a','next-a')).mockResolvedValueOnce(response('b','next-b')).mockResolvedValueOnce(response('c')).mockResolvedValueOnce(response('d'));vi.stubGlobal('fetch',request);
 const competitors=[row('one',['1234']),row('two',['5678'])];const first=await searchSavedCompetitors(competitors,filters);
 expect(first.ads.map(a=>a.page_name)).toEqual(['one','two']);expect(first.creditCost).toBe(2);
 const second=await searchSavedCompetitors(competitors,{...filters,cursor:first.after!});expect(second.after).toBeNull();
 expect((request.mock.calls[2][0] as URL).searchParams.get('cursor')).toBe('next-a');expect((request.mock.calls[3][0] as URL).searchParams.get('cursor')).toBe('next-b');
 expect((request.mock.calls[0][0] as URL).searchParams.get('brand_ids')).toBeNull();
 await expect(searchSavedCompetitors(competitors,{...filters,format:'VIDEO',cursor:first.after!})).rejects.toMatchObject({httpStatus:400});expect(request).toHaveBeenCalledTimes(4);
});
it('requests live collection explicitly and retains successful results if a later Page fails',async()=>{
 vi.stubEnv('FOREPLAY_API_KEY','test');const request=vi.fn().mockResolvedValueOnce(response('a')).mockResolvedValueOnce(Response.json({}, {status:503}));vi.stubGlobal('fetch',request);
 const result=await searchSavedCompetitors([row('one',['1234','5678'])],{...filters,force:true,collect:true});
 expect(result.ads).toHaveLength(1);expect(result.after).toBeTruthy();expect(result.coverageNote).toContain('unavailable');expect((request.mock.calls[0][0] as URL).searchParams.get('collect')).toBe('true');
 await expect(searchSavedCompetitors([row('a'),row('b')],{...filters,force:true})).rejects.toMatchObject({httpStatus:400});
});

it('accepts the millisecond timestamps returned by live Page searches',async()=>{
 vi.stubEnv('FOREPLAY_API_KEY','test');vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({data:[{id:'date',started_running:1795000000000}]})));
 const result=await searchForeplay({...filters,brandIds:[],pageId:'1234'});expect(result.ads[0].ad_delivery_start_time).toBe(new Date(1795000000000).toISOString());
});
