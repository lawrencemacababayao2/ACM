import React, { useRef, useEffect } from 'react';
import Icon from './Icon.jsx';

export default function BenefitsField({ benefits, onChange }) {
  const inputsRef = useRef([]);

  useEffect(() => {
    const lastInput = inputsRef.current[inputsRef.current.length - 1];
    lastInput?.focus();
  }, [benefits.length]);

  const handleAdd = () => {
    onChange([...benefits, '']);
  };

  const handleRemove = (index) => {
    onChange(benefits.filter((_, i) => i !== index));
  };

  const handleChange = (index, value) => {
    onChange(benefits.map((b, i) => (i === index ? value : b)));
  };

  const handleBlur = (index) => {
    const trimmed = benefits[index]?.trim() ?? '';
    if (trimmed !== benefits[index]) {
      onChange(benefits.map((b, i) => (i === index ? trimmed : b)));
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {benefits.map((b, i) => (
        <div key={i} style={{ display: 'flex', gap: 8 }}>
          <input
            ref={(el) => { inputsRef.current[i] = el; }}
            value={b}
            onChange={(e) => handleChange(i, e.target.value)}
            onBlur={() => handleBlur(i)}
            placeholder={`Benefit ${i + 1}`}
            style={{ flex: 1 }}
          />
          <button
            type="button"
            className="btn sm danger"
            onClick={() => handleRemove(i)}
            aria-label={`Remove benefit ${i + 1}`}
          >
            ✕
          </button>
        </div>
      ))}
      <div>
        <button
          type="button"
          className="btn sm"
          onClick={handleAdd}
        >
          <Icon name="plus" size={13} /> Add benefit
        </button>
      </div>
    </div>
  );
}