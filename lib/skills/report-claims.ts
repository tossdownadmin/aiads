export function validatePlanningClaims(value:unknown) {
 const prose=JSON.stringify(value);
 for(const clause of prose.split(/[.;!?]/))if(/\b(?:profitable|profitability|net (?:loss|profit))\b/i.test(clause)&&!/\b(?:cannot|not establish|not confirm|unknown|margin|unverified)\b/i.test(clause))throw Error('Business profitability needs verified margins and business outcomes. Describe attributed revenue versus spend instead.');
 if(/\b(?:(?:above|below|at|exceeds?|achieved?)\s+(?:the\s+)?(?:business\s+)?break[ -]?even|nearly doubled|almost doubled)\b/i.test(prose))throw Error('Use exact revenue-to-spend or measured comparison wording. Business breakeven needs verified margins; qualitative doubling claims need exact comparison evidence.');
 if(/\b(?:shows?|exhibits?|confirms?|indicates?|combat)\b.{0,65}\bfatigue\b/i.test(prose)||/\b(?:audience|creative) (?:is |are )?(?:exhausted|saturated)\b/i.test(prose))throw Error('Do not diagnose fatigue or audience exhaustion from aggregate exposure/clicks. Describe repeated exposure and the investigation needed.');
 if(/\bno (?:conversion )?tracking\b.{0,80}\b(?:active|configured|in place)\b/i.test(prose)||/\btracking (?:is )?(?:broken|inactive|absent)\b/i.test(prose))throw Error('An empty activity read does not establish tracking configuration or health. State only that no events were returned for the supplied dates.');
}

/** A platform metric alone cannot establish attainment of a client target. */
export function validateTargetClaims(value:unknown,ready:boolean,citesTarget:boolean,citesComparison=false) {
 const prose=JSON.stringify(value);
 const attainment=/\b(?:(?:meets?|met|exceeds?|beat|beating|within|below|above|under|over|on|against|off)\s+(?:the\s+)?(?:approved\s+|client\s+|business\s+)?target(?:s|s?\b)|(?:cost|cpa|cpl|roas)\s+(?:is\s+|was\s+)?(?:efficient|healthy|acceptable))\b/i;
 const uncertainty=/\b(?:cannot|unable|not established|not verified|unknown|unavailable|before assessing|to assess|to determine)\b/i;
 for(const clause of prose.split(/[.;!?]/))if(attainment.test(clause)&&!uncertainty.test(clause)&&(!ready||!citesTarget))
  throw Error('A target-attainment claim needs a complete, current approved business profile and a cited matching target. Report the measured result or the missing approval instead.');
 if(!ready&&!citesComparison&&/\b(?:(?:is|are|remains?|delivering|delivers?)\b.{0,65}\b(?:efficient(?:ly)?|cost.effective|healthy)|at low cost)\b/i.test(prose)&&!uncertainty.test(prose))
  throw Error('An efficiency grade needs an approved benchmark or cited comparable measured performance. Describe the reported cost without an unsupported grade.');
}
