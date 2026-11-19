import { NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAdminSession } from '../../../../lib/auth';
import { clientCatalog } from '../../../../lib/competitors/catalog';
import { readClientBoard,writeClientBoard } from '../../../../lib/competitors/store';
const client=z.enum(clientCatalog.map(c=>c.id) as [string,...string[]]);
const board=z.object({id:z.string().min(1).max(120),name:z.string().min(1).max(250)});
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(request:Request) {
  if(!await verifyAdminSession()) return reply({error:'Sign in to manage boards.'},401);
  const query=new URL(request.url).searchParams;
  try {
    if(query.get('list')==='1') {
      if(!process.env.FOREPLAY_API_KEY) return reply({error:'Foreplay is not connected.'},503);
      const response=await fetch('https://public.api.foreplay.co/api/boards',{headers:{Authorization:process.env.FOREPLAY_API_KEY},cache:'no-store'});
      if(!response.ok) return reply({error:'Foreplay could not list the boards on this workspace.'},502);
      const payload=await response.json();
      return reply({boards:z.array(board).parse(payload.data)});
    }
    const input=client.safeParse(query.get('clientId'));
    return input.success?reply({board:await readClientBoard(input.data)}):reply({error:'Unknown client.'},400);
  } catch {return reply({error:'Board settings are unavailable.'},503);}
}
export async function PUT(request:Request) {
  if(!await verifyAdminSession()) return reply({error:'Sign in to manage boards.'},401);
  const input=z.object({clientId:client,board:board.nullable()}).safeParse(await request.json().catch(()=>null));
  if(!input.success) return reply({error:'Choose a valid client and board.'},400);
  try {await writeClientBoard(input.data.clientId,input.data.board);return reply({board:input.data.board});}
  catch {return reply({error:'The board link could not be saved.'},503);}
}
