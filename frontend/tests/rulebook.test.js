import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { RULES } from '../src/rules/rulebook.js';

// Board outcomes and census invariants are covered by ruleExamples.test.js.
describe('public rulebook', () => {
  it('keeps the web rulebook aligned with the shared rule text', () => {
    const html = readFileSync(new URL('../rules.html', import.meta.url), 'utf8');
    for (const r of RULES) for (const text of [r.concept, r.summary, ...r.paragraphs, r.detail]) {
      expect(html).toContain(text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'));
    }
  });
});
