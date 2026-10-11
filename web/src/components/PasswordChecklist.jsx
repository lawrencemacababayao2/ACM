import React from 'react';
import { PASSWORD_RULES, PASSWORD_RULE_LABELS } from '../lib/password.js';

// The live password checklist. Each rule is a bullet that turns green as soon as
// the typed value satisfies it. The caller decides when to show it (usually
// while the field is focused or the value is invalid), so it is never in the way
// once a good password has been entered.
export default function PasswordChecklist({ value }) {
  return (
    <ul className="password-rules">
      {PASSWORD_RULES.map((rule) => {
        const met = rule.test(value);
        return (
          <li key={rule.id} className={met ? 'met' : ''}>
            <span className="password-rule-mark" aria-hidden="true">{met ? '✓' : '•'}</span>
            {PASSWORD_RULE_LABELS[rule.id]}
          </li>
        );
      })}
    </ul>
  );
}
