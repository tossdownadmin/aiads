'use client';

import { useId, useState } from 'react';
import type { Entity } from '../../lib/meta/management/types';
import { creativePreview } from '../../lib/ui/creative-preview';

function PreviewImage({ sources, name }: { sources: string[]; name: string }) {
  const [index, setIndex] = useState(0);
  return sources[index]
    ? <img src={sources[index]} alt={'Preview of '+name} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setIndex(value => value + 1)} />
    : <span className="cm-creative-unavailable"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 6-6 4 4 3-3 5 5"/></svg><span>Preview unavailable</span></span>;
}

export function CreativeMedia({ creative, name }: { creative: unknown; name: string }) {
  const preview = creativePreview(creative);
  return <span className="cm-creative-media">
    <PreviewImage key={preview.images.join('|')} sources={preview.images} name={name}/>
    <span className="cm-creative-format">{preview.format==='Video'&&<span aria-hidden="true">▶ </span>}{preview.format}</span>
  </span>;
}

export function CreativeCaption({ creative }: { creative: unknown }) {
  const preview = creativePreview(creative);
  return <>{preview.headline&&<span className="cm-creative-headline">{preview.headline}</span>}{preview.copy&&<span className="cm-creative-copy">{preview.copy}</span>}</>;
}

export default function CreativePicker({ items, loading, title, name = 'creativeId', initialSelectedId = '' }: { items: Entity[] | null; loading: boolean; title: string; name?: string; initialSelectedId?: string }) {
  const group = useId();
  const [selected, setSelected] = useState(initialSelectedId);
  const [query, setQuery] = useState('');
  const chosen = items?.find(item => item.id === selected);
  const shown = (items || []).filter(item => `${item.name||''} ${item.id} ${creativePreview(item).headline} ${creativePreview(item).copy}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="cm-creative-picker" aria-label={title}>
    <div className="cm-picker-heading"><h3>{title}</h3><small>Choose a creative by its image or video thumbnail.</small></div>
    <input type="hidden" name={name} value={selected}/>
    <label className="cm-picker-search">Find a creative<input type="search" placeholder="Search creatives by name, copy or ID" value={query} onChange={event => setQuery(event.target.value)}/></label>
    {chosen&&<p className="cm-picked" role="status"><span>Selected: <strong>{chosen.name||chosen.id}</strong></span><button type="button" onClick={()=>setSelected('')}>Clear selection</button></p>}
    {loading ? <p role="status">Loading creative previews…</p> : items===null ? <p>Creatives could not be loaded. Close the editor and refresh the workspace.</p> : <>
      <div className="cm-creative-grid cm-picker-grid" role="radiogroup" aria-label={title}>
        {shown.map(item => <label key={item.id} className={'cm-creative-choice '+(selected===item.id?'is-selected':'')}>
          <input type="radio" name={group} value={item.id} checked={selected===item.id} aria-label={'Select '+(item.name||item.id)} onChange={()=>setSelected(item.id)}/>
          <CreativeMedia creative={item} name={item.name||item.id}/>
          <span className="cm-creative-caption"><strong>{item.name||'Untitled creative'}</strong><CreativeCaption creative={item}/><small>{item.id}</small></span>
          {selected===item.id&&<span className="cm-creative-selected" aria-hidden="true">✓ Selected</span>}
        </label>)}
      </div>
      {!shown.length&&<p>{query?'No matching creatives.': 'No creatives returned for this account. Create one in Creative assets first.'}</p>}
    </>}
  </section>;
}
