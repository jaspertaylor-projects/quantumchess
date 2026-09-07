// Progressively enhance the public reference with the same board studies as the game.
import React from 'react';
import { createRoot } from 'react-dom/client';
import RuleIllustration from './RuleIllustration.jsx';
import { RULES } from './rulebook.js';

for (const host of document.querySelectorAll('[data-rule-example]')) {
  const rule = RULES.find((item) => item.id === host.dataset.ruleExample);
  const details = host.closest('details');
  if (!rule || !details) continue;
  let root = null;
  const mount = () => {
    if (!details.open || root) return;
    root = createRoot(host);
    root.render(<RuleIllustration rule={rule} />);
  };
  details.addEventListener('toggle', mount);
  mount();
}
