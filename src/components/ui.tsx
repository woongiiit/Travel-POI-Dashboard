"use client";

import type { ReactNode } from "react";

export type KpiVariant = "blue" | "green" | "purple" | "amber" | "teal" | "neutral" | "red";

export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <header className="topbar">
      <div className="topbar__title">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div className="topbar__right">{right}</div>
    </header>
  );
}

export function Card({
  title,
  unit,
  right,
  children,
  foot,
  style,
}: {
  title?: ReactNode;
  unit?: string;
  right?: ReactNode;
  children: ReactNode;
  foot?: ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <section className="card" style={style}>
      {(title || right) && (
        <div className="card__head">
          <div className="card__title">{title}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {unit && <span className="card__unit">{unit}</span>}
            {right}
          </div>
        </div>
      )}
      <div className="card__body">{children}</div>
      {foot && <div className="card__foot">{foot}</div>}
    </section>
  );
}

export function Kpi({
  icon,
  variant = "blue",
  label,
  value,
  unit,
  sub,
}: {
  icon: ReactNode;
  variant?: KpiVariant;
  label: string;
  value: ReactNode;
  unit?: string;
  sub?: ReactNode;
}) {
  return (
    <div className={`kpi kpi--${variant}`}>
      <div className="kpi__icon">{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div className="kpi__label">{label}</div>
        <div className="kpi__value">
          {value}
          {unit && <small>{unit}</small>}
        </div>
        {sub && <div className="kpi__sub">{sub}</div>}
      </div>
    </div>
  );
}

export function Select({
  label,
  icon,
  value,
  options,
  onChange,
}: {
  label: string;
  icon?: ReactNode;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="field">
      <label>
        {icon && <span className="field__icon">{icon}</span>}
        {label}
      </label>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

export function LoadingState({ label = "데이터를 불러오는 중입니다…" }: { label?: string }) {
  return (
    <div className="loading">
      <div className="spinner" />
      {label}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="loading" style={{ color: "var(--red)" }}>
      {message}
    </div>
  );
}

export function EmptyState({ label = "표시할 데이터가 없습니다." }: { label?: string }) {
  return <div className="loading">{label}</div>;
}

export function StatRow({
  icon,
  label,
  value,
  last,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <div className="stat-row" style={{ borderBottom: last ? "none" : undefined }}>
      <span className="stat-row__icon">{icon}</span>
      <span className="stat-row__label">{label}</span>
      <span className="stat-row__value">{value}</span>
    </div>
  );
}

export function InsightBlock({
  icon,
  tone = "teal",
  title,
  text,
  children,
  onClick,
}: {
  icon: ReactNode;
  tone?: "teal" | "green" | "purple" | "amber" | "blue";
  title?: ReactNode;
  text?: ReactNode;
  children?: ReactNode;
  onClick?: () => void;
}) {
  return (
    <div className="insight" onClick={onClick} style={onClick ? { cursor: "pointer" } : undefined}>
      <div className={`insight__icon insight__icon--${tone}`}>{icon}</div>
      <div style={{ minWidth: 0 }}>
        {title && <div className="insight__title">{title}</div>}
        {text && <div className="insight__text">{text}</div>}
        {children}
      </div>
    </div>
  );
}
