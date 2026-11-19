'use client';
import {useEffect,useState} from 'react';
import type { ClientBoard } from '../../lib/competitors/store';
type BoardMode = '' | 'advertisers' | 'curated';
export default function BoardPicker({clientId,onUse,using}:{clientId:string;onUse:(value:BoardMode)=>void;using:BoardMode}) {
  const [board,setBoard]=useState<ClientBoard|null>(null),[boards,setBoards]=useState<ClientBoard[]|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{
    let active=true;
    fetch('/api/competitors/boards?clientId='+encodeURIComponent(clientId),{cache:'no-store'}).then(async r=>{
      if(!r.ok) throw Error();const data=await r.json();if(active)setBoard(data.board);
    }).catch(()=>{if(active)setError('Could not open the linked board.');});
    return ()=>{active=false;};
  },[clientId]);
  async function list() {
    setBusy(true);setError('');
    try {const r=await fetch('/api/competitors/boards?list=1',{cache:'no-store'}),d=await r.json();if(!r.ok)throw Error(d.error);setBoards(d.boards);}
    catch(e){setError(e instanceof Error?e.message:'Could not list boards.');} finally{setBusy(false);}
  }
  async function save(next:ClientBoard|null) {
    setBusy(true);setError('');
    try {const r=await fetch('/api/competitors/boards',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({clientId,board:next})});
      if(!r.ok)throw Error();setBoard(next);setBoards(null);onUse('');}
    catch {setError('The board link could not be saved.');}finally{setBusy(false);}
  }
  return <section className="lookup-head"><div><h4>Foreplay board</h4>
    {board && <label className="field">Ad source<select value={using} onChange={e=>onUse(e.target.value as BoardMode)}>
      <option value="">Confirmed advertisers in Tossdown</option>
      <option value="advertisers">Ads from advertisers on {board.name} (up to 10)</option>
      <option value="curated">Only ads saved on {board.name}</option>
    </select></label>}
    {boards && <label className="field">Link a board to this client<select disabled={busy} value={board?.id||''} onChange={e=>void save(boards.find(b=>b.id===e.target.value)||null)}><option value="">No linked board</option>{boards.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select>{!boards.length && 'No boards in this Foreplay workspace.'}</label>}
    {error && <p role="alert">{error}</p>}
    </div><button type="button" disabled={busy} className="secondary-button" onClick={()=>void list()}>{busy?'Loading…':board?'Manage board':'Choose board'} · 1 credit</button></section>;
}
