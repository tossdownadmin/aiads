import type { Risk } from './types';
const rules: Array<[RegExp,string]> = [
  [/ignore\s+(all\s+)?previous\s+instructions/i, 'prompt injection pattern'],
  [/\b(?:curl|wget)\b[^\n]*(?:\||sh\b|bash\b)/i, 'remote shell execution'],
  [/(?:https?:\/\/|www\.)[^\s]+/i, 'external URL requires allowlist review'],
  [/\b(?:ask|request|send)\b[^\n]*(?:token|secret|credential|password)/i, 'credential handling instruction'],
  [/\u200b|\u200c|\u200d|<!--/i, 'hidden or encoded instruction content'],
  [/\b(?:delete|pause|activate|increase|decrease|change)\b[^\n]*(?:budget|campaign|ad|status)/i, 'live write instruction'],
];
export function scanSkill(input: string, files: string[] = []) { const findings = rules.flatMap(([r,msg]) => r.test(input) ? [msg] : []); if (files.some(f => f.startsWith('scripts/'))) findings.push('bundled scripts are reference-only and must never execute'); const risk: Risk = findings.some(f => /injection|shell|credential|hidden/.test(f)) ? 'high' : findings.length ? 'medium' : 'low'; return { risk, findings }; }
