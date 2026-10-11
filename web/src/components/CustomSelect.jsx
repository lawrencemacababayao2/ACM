import React from 'react';

export default function CustomSelect({ value, onChange, options = [], placeholder, required, disabled, className = '', id }) {
  return (
    <select
      id={id}
      className={`custom-select ${className}`}
      value={value}
      onChange={onChange}
      required={required}
      disabled={disabled}
    >
      {placeholder && <option value=''>{placeholder}</option>}
      {options.map((opt) => {
        if (typeof opt === 'string') {
          return (
            <option key={opt} value={opt}>
              {opt}
            </option>
          );
        }
        return (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        );
      })}
    </select>
  );
}
