import { describe, it, expect } from 'vitest';
import { buildPrompt, buildSystemMessage, SCHEMA_TAGS, UNIVERSAL_CONSTRAINTS } from '../src/router/prompt.js';
import { ROUTER_TASKS, ALL_ROUTER_TASKS } from '../src/config/tasks.js';

describe('prompt header injection', () => {
  it('embeds the router task name verbatim so DO semantic matching can lock on', () => {
    const p = buildPrompt({
      task: ROUTER_TASKS.TARGETED_IMPLEMENTATION,
      schemaTag: SCHEMA_TAGS.PATCH,
      hardConstraints: ['minimal change'],
      body: 'BODY',
    });
    expect(p).toMatch(/^\[NERDFORGE_ROUTER_TASK=unit-test-targeted-implementation\]/);
    expect(p).toContain('[OUTPUT_SCHEMA=nerdforge.patch.v1]');
    expect(p).toContain('[/HARD_CONSTRAINTS]');
    expect(p).toContain('BODY');
  });

  it('includes every universal constraint', () => {
    const p = buildPrompt({
      task: ROUTER_TASKS.ARCHITECTURE_BLUEPRINT,
      schemaTag: SCHEMA_TAGS.BLUEPRINT,
      hardConstraints: [],
      body: 'x',
    });
    for (const c of UNIVERSAL_CONSTRAINTS) expect(p).toContain(c);
  });

  it('rejects unknown router task ids (hardcoded registry only)', () => {
    expect(() =>
      buildPrompt({
        // @ts-expect-error intentional bad input
        task: 'not-a-real-task',
        schemaTag: 'x',
        hardConstraints: [],
        body: 'x',
      }),
    ).toThrow(/Unknown router task/);
  });

  it('system message names the specific task', () => {
    for (const t of ALL_ROUTER_TASKS) {
      expect(buildSystemMessage(t)).toContain(`Target task: ${t}.`);
    }
  });
});
