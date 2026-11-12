export function canExecuteSkillAction(action: { writes: boolean; confirmed: boolean }) { return !action.writes || action.confirmed; }
export const SAFETY_POLICY = { readOnlyByDefault: true, writesRequireConfirmation: true, fetchedScriptsNeverExecute: true } as const;
