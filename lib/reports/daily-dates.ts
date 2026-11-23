import type {Window} from './model';

const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
const escape=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const parts=(day:string)=>{
  const [year,month,date]=day.split('-').map(Number),name=months[month-1]??'';
  return {year,date,month,pattern:'(?:'+name+'|'+name.slice(0,3)+'\\.?)'};
};

/** Recognize exact supplied date ranges as metadata, never arbitrary numbers.
 * A wrong endpoint or year must remain visible to the numeric claim guard. */
export function maskReportingDates(prose:string,windows:Window[]){
  const patterns:string[]=[];
  for(const window of windows){
    const start=parts(window.since),end=parts(window.until);
    if(!Number.isFinite(start.year)||!Number.isFinite(end.year)||!months[start.month-1]||!months[end.month-1])continue;
    const left=start.pattern+'\\s+'+start.date;
    const right=(start.month===end.month?'(?:'+end.pattern+'\\s+)?':end.pattern+'\\s+')+end.date;
    const separator='\\s*(?:[-–—]|to|through)\\s*';
    const optionalYear=(year:number)=>'(?:,?\\s+'+year+')?';
    // Match a whole range before any standalone endpoint, including a supplied
    // year. Avoid masking a valid prefix inside a different year or day.
    patterns.push(left+optionalYear(start.year)+separator+right+optionalYear(end.year));
    patterns.push(escape(window.since)+separator+escape(window.until));
  }
  const ranges=patterns.length?new RegExp('\\b(?:'+patterns.join('|')+')(?![\\d]|,?\\s+\\d{4}\\b)','gi'):null;
  let masked=ranges?prose.replace(ranges,'REPORTING_DATE_RANGE'):prose;
  // ISO endpoints are useful on their own. Human day labels are only accepted
  // above as a complete known range, rather than masking arbitrary event dates.
  for(const window of windows)for(const date of [window.since,window.until])
    masked=masked.replace(new RegExp('\\b'+escape(date)+'(?![\\d-])','g'),'REPORTING_DATE');
  return masked;
}
