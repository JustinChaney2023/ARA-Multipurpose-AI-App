import { useState, type ReactNode } from 'react';

import { Icon } from './Icon';

interface TooltipProps {
  children: ReactNode;
  content: ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
}

export function Tooltip({ children, content, position = 'top', delay = 300 }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [timeoutId, setTimeoutId] = useState<NodeJS.Timeout | null>(null);

  const show = () => {
    const id = setTimeout(() => setIsVisible(true), delay);
    setTimeoutId(id);
  };

  const hide = () => {
    if (timeoutId) clearTimeout(timeoutId);
    setIsVisible(false);
  };

  const positionStyles = {
    top: { bottom: '100%', left: '50%', transform: 'translateX(-50%) translateY(-8px)' },
    bottom: { top: '100%', left: '50%', transform: 'translateX(-50%) translateY(8px)' },
    left: { right: '100%', top: '50%', transform: 'translateY(-50%) translateX(-8px)' },
    right: { left: '100%', top: '50%', transform: 'translateY(-50%) translateX(8px)' },
  };

  const arrowStyles = {
    top: { bottom: '-4px', left: '50%', transform: 'translateX(-50%) rotate(45deg)' },
    bottom: { top: '-4px', left: '50%', transform: 'translateX(-50%) rotate(45deg)' },
    left: { right: '-4px', top: '50%', transform: 'translateY(-50%) rotate(45deg)' },
    right: { left: '-4px', top: '50%', transform: 'translateY(-50%) rotate(45deg)' },
  };

  return (
    <span
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {isVisible && (
        <span
          style={{
            position: 'absolute',
            ...positionStyles[position],
            background: '#1e293b',
            color: 'white',
            padding: '0.5rem 0.75rem',
            borderRadius: '6px',
            fontSize: '0.75rem',
            whiteSpace: 'nowrap',
            zIndex: 1000,
            animation: 'fadeIn 0.15s ease-out',
            maxWidth: '250px',
            lineHeight: 1.4,
          }}
        >
          {content}
          <span
            style={{
              position: 'absolute',
              width: '8px',
              height: '8px',
              background: '#1e293b',
              ...arrowStyles[position],
            }}
          />
        </span>
      )}
    </span>
  );
}

export function HelpTooltip({ text }: { text: string }) {
  return (
    <Tooltip content={text} position="right">
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '18px',
          height: '18px',
          borderRadius: '50%',
          background: '#e2e8f0',
          color: '#64748b',
          fontSize: '11px',
          fontWeight: 'bold',
          cursor: 'help',
          marginLeft: '0.5rem',
        }}
      >
        ?
      </span>
    </Tooltip>
  );
}

export function InfoBadge({
  children,
  type = 'info',
}: {
  children: ReactNode;
  type?: 'info' | 'warning' | 'success' | 'tip';
}) {
  const colors = {
    info: { bg: '#dbeafe', border: '#bfdbfe', text: '#1e40af', iconName: 'warning' as const },
    warning: { bg: '#fef3c7', border: '#fde68a', text: '#92400e', iconName: 'warning' as const },
    success: { bg: '#d1fae5', border: '#a7f3d0', text: '#065f46', iconName: 'check' as const },
    tip: { bg: '#f3e8ff', border: '#e9d5ff', text: '#6b21a8', iconName: 'sparkles' as const },
  };

  const style = colors[type];

  return (
    <div
      style={{
        background: style.bg,
        border: `1px solid ${style.border}`,
        borderRadius: '8px',
        padding: '0.75rem 1rem',
        margin: '0.75rem 0',
        fontSize: '0.875rem',
        color: style.text,
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.5rem',
      }}
    >
      <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center' }}>
        <Icon name={style.iconName} size={14} color={style.text} />
      </span>
      <span>{children}</span>
    </div>
  );
}
