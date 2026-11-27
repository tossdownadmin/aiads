// Cell contents come from the escaped document renderer or an already-rendered report.
export type ReportTable = 'metrics' | 'actions' | 'portfolio-actions';
export function dailyTable(kind: ReportTable, rows: string[][]) {
  const headers = kind === 'metrics' ? ['Metric', 'Value', 'Source or scope']
    : kind === 'portfolio-actions' ? ['Account', 'Review', 'Suggested action', 'Supporting evidence']
    : ['Review', 'Suggested action', 'Supporting evidence'];
  const head = headers.map(label => '<th scope="col">'+label+'</th>').join('');
  const body = rows.map(cells => '<tr>'+cells.map((cell,index) =>
    index === 0 ? '<th scope="row">'+cell+'</th>' : '<td>'+cell+'</td>'
  ).join('')+'</tr>').join('');
  const label = kind === 'metrics' ? 'Reported metrics' : 'Suggested actions';
  return '<div class="table-wrap"><table class="report-table '+kind+'" aria-label="'+label+'"><thead><tr>'+head+'</tr></thead><tbody>'+body+'</tbody></table></div>';
}

// A request for a missing planning input belongs below delivery follow-ups.
// Keep actual overspend, budget changes and performance investigations in the queue.
export function isPlanningInputAction(action:string){
  return /^(?:supply|provide|confirm|document|obtain|request|establish|define|agree on)\b/i.test(action.trim()) &&
    /\b(?:approved (?:\w+ ){0,3}budget|monthly budget|budget ceiling|budget cap|acceptable (?:cost per|cpa|cpl|roas)|target (?:cost per|cpa|cpl|roas))\b/i.test(action) &&
    !/\b(?:whether|exceeded|overspend|increase|decrease|reallocat\w*|pause|reduce|shift|change[ds]?)\b/i.test(action);
}
export function planningInputTable(kind:'actions'|'portfolio-actions',rows:string[][]){
  return rows.length?'<details class="planning-inputs"><summary>Optional planning inputs ('+rows.length+')</summary>'+dailyTable(kind,rows)+'</details>':'';
}
