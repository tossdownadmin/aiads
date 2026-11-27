import { BRAND_ICON_DATA_URI } from '../ui/brand-icon';
import { dailyStyles } from './daily-style';
import { detailStyles } from './detail-view';
import { dailyTable } from './daily-tables';

/** Reformat an archived standalone document in memory. Its source data and saved blob stay intact. */
export function dailySavedView(html: string): string {
  if (!html || html.startsWith('<!doctype html><html lang="en" data-report-layout="tables-v1">')) return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const favicon = doc.createElement('link');
  favicon.rel = 'icon';
  favicon.type = 'image/png';
  favicon.href = BRAND_ICON_DATA_URI;
  doc.head.querySelectorAll('link[rel="icon"]').forEach(icon => icon.remove());
  doc.head.append(favicon);
  const mark = doc.querySelector('.logo-mark');
  if (mark) {
    const icon = doc.createElement('img');
    Object.assign(icon, {src: BRAND_ICON_DATA_URI, width: 32, height: 32, alt: 'Tossdown'});
    mark.replaceChildren(icon);
  }
  for (const panel of doc.querySelectorAll('.tab-panel[data-panel]')) {
    const gallery = panel.querySelector(':scope > .cg-campaigns');
    const heading = gallery?.previousElementSibling;
    if (gallery && gallery !== panel.lastElementChild && heading?.classList.contains('section-label') && heading.textContent?.startsWith('Campaign Performance')) panel.append(heading, gallery);

    const comparison = panel.querySelector('table.cmp')?.closest('.table-wrap');
    const cards = panel.querySelector(':scope > .all-accounts-grid');
    if (cards && comparison) {
      const details = doc.createElement('details'), summary = doc.createElement('summary');
      details.className = 'account-breakdowns';
      summary.textContent = 'Account highlights and custom KPIs';
      comparison.after(details);
      details.append(summary, cards);
      const label = comparison.previousElementSibling;
      if (label?.textContent?.startsWith('Side-by-side — ')) label.textContent = label.textContent.replace('Side-by-side — ', 'Account performance — ').replace(' (click a row to open the account)', '');
    }
    if (panel.getAttribute('data-panel') !== 'overview') {
      for (const grid of panel.querySelectorAll('.kpi-grid')) {
        const rows = Array.from(grid.children, card => ['.kpi-label','.kpi-value','.kpi-sub'].map(selector => card.querySelector(selector)?.innerHTML));
        if (rows.length && rows.every(row => row.every(cell => cell !== undefined))) grid.outerHTML = dailyTable('metrics', rows as string[][]);
      }
    }
    const portfolio = panel.getAttribute('data-panel') === 'overview';
    for (const list of panel.querySelectorAll('.priority-group > .action-list')) {
      const rows: string[][] = [];
      for (const card of list.children) {
        const action = card.querySelector('.rec-title'), reason = card.querySelector('.rec-body');
        const chip = card.querySelector('.issue-chip'), account = card.querySelector('.action-account');
        if (!action || !reason || !chip || (portfolio && !account)) break;
        const cells = [chip.outerHTML, action.outerHTML+reason.outerHTML, card.querySelector('.finding-evidence')?.outerHTML || '—'];
        if (portfolio && account) cells.unshift(account.outerHTML);
        rows.push(cells);
      }
      if (rows.length && rows.length === list.children.length) list.outerHTML = dailyTable(portfolio ? 'portfolio-actions' : 'actions', rows);
    }
  }
  const theme = doc.createElement('style');
  theme.textContent = dailyStyles+detailStyles;
  doc.head.append(theme);
  doc.documentElement.dataset.reportLayout = 'tables-v1';
  return '<!doctype html>'+doc.documentElement.outerHTML;
}
