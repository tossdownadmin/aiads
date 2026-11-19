import { describe, expect, it } from 'vitest';
import { getBuiltinSkills } from '../lib/skills/builtin';

describe('first-party skill routing', () => {
  it('publishes distinct read-only methods to the correct workspace', () => {
    const skills = getBuiltinSkills();
    expect(new Set(skills.map(skill => skill.name)).size).toBe(skills.length);
    expect(skills.filter(skill => skill.categories.includes('analysis') && !skill.categories.includes('competitor_intel'))).toHaveLength(3);
    expect(skills.filter(skill => skill.categories.includes('competitor_intel'))).toHaveLength(2);
    expect(skills.every(skill => skill.source === 'tossdown-aiads' && skill.status === 'approved' && !skill.writeActions && skill.body.length > 100)).toBe(true);
  });
});
