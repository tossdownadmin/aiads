export function validatePlanningClaims(value:unknown) {
 const prose=JSON.stringify(value);
 if(/\b(?:shows?|exhibits?|confirms?|indicates?|combat)\b.{0,65}\bfatigue\b/i.test(prose)||/\b(?:audience|creative) (?:is |are )?(?:exhausted|saturated)\b/i.test(prose))throw Error('Do not diagnose fatigue or audience exhaustion from aggregate exposure/clicks. Describe repeated exposure and the investigation needed.');
 if(/\bno (?:conversion )?tracking\b.{0,80}\b(?:active|configured|in place)\b/i.test(prose)||/\btracking (?:is )?(?:broken|inactive|absent)\b/i.test(prose))throw Error('An empty activity read does not establish tracking configuration or health. State only that no events were returned for the supplied dates.');
}
