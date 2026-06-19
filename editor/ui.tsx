import React from "react";
import type { Opt } from "./options";

export const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="field">
    <label>{label}</label>
    {children}
  </div>
);

export const NumberField: React.FC<{
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
}> = ({ label, value, onChange, step, min, max }) => (
  <Field label={label}>
    <input
      type="number"
      value={Number.isFinite(value) ? value : 0}
      step={step ?? 1}
      min={min}
      max={max}
      onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
    />
  </Field>
);

export const TextField: React.FC<{ label: string; value: string; onChange: (v: string) => void }> = ({
  label,
  value,
  onChange,
}) => (
  <Field label={label}>
    <input type="text" value={value} onChange={(e) => onChange(e.target.value)} />
  </Field>
);

export const ColorField: React.FC<{ label: string; value: string; onChange: (v: string) => void }> = ({
  label,
  value,
  onChange,
}) => (
  <Field label={label}>
    <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
  </Field>
);

export const SelectField: React.FC<{
  label: string;
  value: string;
  options: Opt[];
  onChange: (v: string) => void;
  noneLabel?: string;
}> = ({ label, value, options, onChange, noneLabel }) => (
  <Field label={label}>
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {noneLabel !== undefined ? <option value="">{noneLabel}</option> : null}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  </Field>
);

/** Multi-select chips for stacking effect ids. */
export const ChipPicker: React.FC<{ options: Opt[]; selected: string[]; onToggle: (id: string) => void }> = ({
  options,
  selected,
  onToggle,
}) => (
  <div className="chips">
    {options.map((o) => (
      <button
        key={o.value}
        type="button"
        className={`chip ${selected.includes(o.value) ? "on" : ""}`}
        onClick={() => onToggle(o.value)}
      >
        {o.label}
      </button>
    ))}
  </div>
);
