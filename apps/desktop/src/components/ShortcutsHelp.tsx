import { COMMON_SHORTCUTS, formatShortcut } from '../utils/keyboard';

interface ShortcutsHelpProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ShortcutsHelp({ isOpen, onClose }: ShortcutsHelpProps) {
  if (!isOpen) return null;

  const shortcuts = [
    { ...COMMON_SHORTCUTS.new, action: 'Create new blank form' },
    { ...COMMON_SHORTCUTS.save, action: 'Save draft locally' },
    { ...COMMON_SHORTCUTS.export, action: 'Export to PDF' },
    { ...COMMON_SHORTCUTS.print, action: 'Print form' },
    { ...COMMON_SHORTCUTS.escape, action: 'Close dialog / Cancel' },
  ];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        animation: 'fadeIn 0.2s ease-out',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'white',
          borderRadius: '12px',
          padding: '1.5rem',
          maxWidth: '480px',
          width: '90%',
          maxHeight: '80vh',
          overflow: 'auto',
          animation: 'slideUp 0.2s ease-out',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem',
          }}
        >
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>Keyboard Shortcuts</h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: '#64748b',
              padding: '0.25rem',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {shortcuts.map((shortcut, index) => (
              <tr key={index} style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '0.75rem 0' }}>
                  <kbd
                    style={{
                      background: '#f1f5f9',
                      border: '1px solid #cbd5e1',
                      borderRadius: '4px',
                      padding: '0.25rem 0.5rem',
                      fontFamily: 'monospace',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                    }}
                  >
                    {formatShortcut(shortcut)}
                  </kbd>
                </td>
                <td style={{ padding: '0.75rem 0', color: '#475569', fontSize: '0.875rem' }}>
                  {shortcut.action}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <p
          style={{ marginTop: '1rem', fontSize: '0.75rem', color: '#94a3b8', textAlign: 'center' }}
        >
          Press{' '}
          <kbd style={{ background: '#f1f5f9', padding: '0.125rem 0.25rem', borderRadius: '3px' }}>
            ?
          </kbd>{' '}
          anywhere to show this help
        </p>
      </div>
    </div>
  );
}
