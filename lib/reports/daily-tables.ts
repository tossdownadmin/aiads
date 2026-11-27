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
