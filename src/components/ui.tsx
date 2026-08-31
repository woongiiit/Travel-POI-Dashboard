"use client";

import type { ReactNode } from "react";
import { Plus, TrendingUp } from "lucide-react";
import { AppIcon } from "@/components/icons";

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

export type KpiHoverRow = { label: string; value: ReactNode; unit?: string };

export function Kpi({
  icon,
  variant = "blue",
  label,
  value,
  unit,
  sub,
  hoverBreakdown,
  hoverMetaphors,
}: {
  icon: ReactNode;
  variant?: KpiVariant;
  label: string;
  value: ReactNode;
  unit?: string;
  sub?: ReactNode;
  hoverBreakdown?: KpiHoverRow[];
  hoverMetaphors?: string[];
}) {
  const hasBreakdown = hoverBreakdown && hoverBreakdown.length > 0;
  const hasMetaphors = hoverMetaphors && hoverMetaphors.length > 0;
  const hoverable = hasBreakdown || hasMetaphors;

  const hoverTitle = hasMetaphors
    ? "마우스를 올리면 배출량을 일상 비유로 볼 수 있습니다"
    : hasBreakdown
      ? "마우스를 올리면 현지인·외지인 상세를 볼 수 있습니다"
      : undefined;

  return (
    <div
      className={`kpi kpi--${variant}${hoverable ? " kpi--hoverable" : ""}${hasMetaphors ? " kpi--metaphor" : ""}`}
      tabIndex={hoverable ? 0 : undefined}
      title={hoverTitle}
    >
      {hoverable && (
        <span
          className={`kpi__expand-hint${hasMetaphors ? " kpi__expand-hint--insight" : ""}`}
          aria-hidden="true"
        >
          <AppIcon
            icon={hasMetaphors ? TrendingUp : Plus}
            size={12}
            strokeWidth={2.75}
          />
        </span>
      )}
      <div className="kpi__icon">{icon}</div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="kpi__label">{label}</div>
        <div className="kpi__value">
          {value}
          {unit && <small>{unit}</small>}
        </div>
        {sub && <div className="kpi__sub">{sub}</div>}
        {hasBreakdown && (
          <div className="kpi__breakdown" aria-hidden="true">
            {hoverBreakdown.map((row) => (
              <div key={row.label} className="kpi__breakdown-row">
                <span>{row.label}</span>
                <strong>
                  {row.value}
                  {row.unit && <small>{row.unit}</small>}
                </strong>
              </div>
            ))}
          </div>
        )}
        {hasMetaphors && (
          <div className="kpi__metaphors" aria-hidden="true">
            <ul>
              {hoverMetaphors.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="kpi__metaphors-foot">참고 환산 (배출·흡수 계수 가정)</p>
          </div>
        )}
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
  formatOption,
}: {
  label: string;
  icon?: ReactNode;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  formatOption?: (value: string) => string;
}) {
  const fmt = formatOption ?? ((v: string) => v);
  return (
    <div className="field">
      <label>
        {icon && <span className="field__icon">{icon}</span>}
        {label}
      </label>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o} value={o}>
            {fmt(o)}
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
