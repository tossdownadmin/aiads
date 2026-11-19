import { get, list, put } from '@vercel/blob';

export type ConfirmedCompetitor = { id: string; name: string; domain: string; website?: string; reviewed?: boolean };
const prefix = 'competitors/brand-maps/';

export async function readCompetitors(clientId: string): Promise<ConfirmedCompetitor[]> {
  const pathname = `${prefix}${clientId}.json`;
  const { blobs } = await list({ prefix: pathname, limit: 1 });
  const blob = blobs.find(item => item.pathname === pathname);
  if (!blob) return [];
  const response = await get(blob.url, { access: 'private', useCache: false });
  if (!response) return [];
  const payload = JSON.parse(await new Response(response.stream).text()) as { competitors?: ConfirmedCompetitor[] };
  return Array.isArray(payload.competitors) ? payload.competitors : [];
}

export async function writeCompetitors(clientId: string, competitors: ConfirmedCompetitor[], reviewedBy: string) {
  await put(`${prefix}${clientId}.json`, JSON.stringify({ clientId, competitors, reviewedBy, reviewedAt: new Date().toISOString() }), {
    access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json',
  });
}

export type ClientBoard = {id:string;name:string};
export async function readClientBoard(clientId:string):Promise<ClientBoard|null> {
  const file=await get('competitors/client-boards/'+clientId+'.json',{access:'private',useCache:false});
  return file?.stream ? (await new Response(file.stream).json()).board : null;
}
export async function writeClientBoard(clientId:string,board:ClientBoard|null) {
  await put('competitors/client-boards/'+clientId+'.json',JSON.stringify({board}),{access:'private',allowOverwrite:true,addRandomSuffix:false,contentType:'application/json'});
}
