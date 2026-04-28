import React, { useState } from 'react';

/* — Btn ——————————————————————————————————————————————————————————— */

interface BtnProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  onClick?: () => void;
  disabled?: boolean;
  style?: React.CSSProperties;
  title?: string;
  type?: 'button' | 'submit' | 'reset';
}

export function Btn({
  children,
  variant = 'primary',
  size = 'md',
  onClick,
  disabled,
  style,
  title,
  type = 'button',
}: BtnProps) {
  const base: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontFamily: 'var(--font)',
    fontWeight: 500,
    cursor: disabled ? 'not-allowed' : 'pointer',
    border: 'none',
    borderRadius: 'var(--radius)',
    transition: 'all 0.15s ease',
    opacity: disabled ? 0.45 : 1,
    fontSize: size === 'sm' ? 12 : 13,
    padding: size === 'sm' ? '5px 10px' : '7px 14px',
    justifyContent: 'center',
  };

  const variantStyles: Record<string, React.CSSProperties> = {
    primary:   { background: 'var(--accent)', color: '#fff' },
    secondary: { background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border2)' },
    ghost:     { background: 'transparent', color: 'var(--text-muted)' },
    danger:    { background: 'var(--red-dim)', color: 'var(--red)', border: '1px solid transparent' },
  };

  return (
    <button
      type={type}
      style={{ ...base, ...variantStyles[variant], ...style }}
      onClick={onClick}
      disabled={disabled}
      title={title}
      onMouseEnter={e => { if (!disabled) (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1.12)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.filter = 'none'; }}
    >
      {children}
    </button>
  );
}

/* — Card ——————————————————————————————————————————————————————————— */

interface CardProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export function Card({ children, style }: CardProps) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      padding: '1.25rem',
      marginBottom: '0.75rem',
      ...style,
    }}>
      {children}
    </div>
  );
}

/* — Badge ——————————————————————————————————————————————————————————— */

interface BadgeProps {
  children: React.ReactNode;
  color?: 'accent' | 'green' | 'red' | 'amber';
}

export function Badge({ children, color = 'accent' }: BadgeProps) {
  const colorMap: Record<string, React.CSSProperties> = {
    accent: { background: 'var(--accent-dim)', color: 'var(--accent)' },
    green:  { background: 'var(--green-dim)',  color: 'var(--green)' },
    red:    { background: 'var(--red-dim)',     color: 'var(--red)' },
    amber:  { background: 'var(--amber-dim)',  color: 'var(--amber)' },
  };

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 99,
      fontSize: 11, fontWeight: 600,
      ...colorMap[color],
    }}>
      {children}
    </span>
  );
}

/* — StatusDot ——————————————————————————————————————————————————————— */

export function StatusDot({ online }: { online: boolean }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      fontSize: 12, color: online ? 'var(--green)' : 'var(--red)',
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: online ? 'var(--green)' : 'var(--red)',
        boxShadow: online ? '0 0 6px var(--green)' : '0 0 6px var(--red)',
      }} />
      {online ? 'AI Ready' : 'AI Offline'}
    </span>
  );
}

/* — Spinner ————————————————————————————————————————————————————————— */

export function Spinner() {
  return (
    <span style={{
      width: 14, height: 14,
      border: '2px solid var(--border2)',
      borderTopColor: 'var(--accent)',
      borderRadius: '50%',
      animation: 'spin 0.7s linear infinite',
      display: 'inline-block',
      flexShrink: 0,
    }} />
  );
}

/* — ProgressBar ————————————————————————————————————————————————————— */

interface ProgressBarProps {
  pct: number;
  label?: string;
}

export function ProgressBar({ pct, label }: ProgressBarProps) {
  return (
    <div>
      {label && (
        <div style={{
          fontSize: 12, color: 'var(--text-muted)', marginBottom: 6,
          display: 'flex', justifyContent: 'space-between',
        }}>
          <span>{label}</span>
          <span>{pct}%</span>
        </div>
      )}
      <div style={{ height: 4, background: 'var(--border2)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pct}%`,
          background: 'var(--accent)', borderRadius: 2,
          transition: 'width 0.3s ease',
        }} />
      </div>
    </div>
  );
}

/* — CopyBtn ————————————————————————————————————————————————————————— */

export function CopyBtn({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Btn variant="ghost" size="sm" onClick={handleCopy}
      style={{ color: copied ? 'var(--green)' : 'var(--text-muted)' }}>
      {copied ? '✓ Copied' : label}
    </Btn>
  );
}

/* — Divider ————————————————————————————————————————————————————————— */

export function Divider({ label }: { label?: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      color: 'var(--text-sub)', fontSize: 12, margin: '1rem 0',
    }}>
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      {label && <span>{label}</span>}
      {label && <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />}
    </div>
  );
}
