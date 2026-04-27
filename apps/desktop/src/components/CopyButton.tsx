import { useState } from 'react';

import { copyToClipboard } from '../utils/clipboard';

import { Icon } from './Icon';
import { Tooltip } from './Tooltip';

interface CopyButtonProps {
  text: string;
  label?: string;
  size?: 'small' | 'medium';
}

export function CopyButton({ text, label, size = 'small' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const success = await copyToClipboard(text);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const sizeStyles = {
    small: { padding: '0.25rem', fontSize: '0.75rem' },
    medium: { padding: '0.5rem', fontSize: '0.875rem' },
  };

  return (
    <Tooltip content={copied ? 'Copied!' : 'Copy to clipboard'}>
      <button
        onClick={handleCopy}
        style={{
          background: copied ? '#dcfce7' : 'transparent',
          border: '1px solid var(--color-border)',
          borderRadius: '4px',
          cursor: 'pointer',
          color: copied ? '#166534' : '#64748b',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.25rem',
          transition: 'all 0.2s',
          ...sizeStyles[size],
        }}
        disabled={!text}
      >
        {copied ? <Icon name="check" size={14} color="#166534" /> : <Icon name="copy" size={14} />}
        {label && <span>{copied ? 'Copied' : label}</span>}
      </button>
    </Tooltip>
  );
}
