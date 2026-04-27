import { useMemo } from 'react';

import { getWordCount, getCharCount, formatCount } from '../utils/clipboard';

interface WordCountProps {
  text: string;
  showChars?: boolean;
}

export function WordCount({ text, showChars = true }: WordCountProps) {
  const stats = useMemo(
    () => ({
      words: getWordCount(text),
      chars: getCharCount(text),
    }),
    [text]
  );

  return (
    <span
      style={{
        fontSize: '0.75rem',
        color: stats.words === 0 ? '#94a3b8' : '#64748b',
        fontWeight: 400,
      }}
    >
      {formatCount(stats.words, 'word', 'words')}
      {showChars && ` · ${stats.chars} chars`}
    </span>
  );
}

interface TextStatsProps {
  text: string;
  maxWords?: number;
  maxChars?: number;
}

export function TextStats({ text, maxWords, maxChars }: TextStatsProps) {
  const stats = useMemo(
    () => ({
      words: getWordCount(text),
      chars: getCharCount(text),
    }),
    [text]
  );

  const wordWarning = maxWords && stats.words > maxWords * 0.9;
  const charWarning = maxChars && stats.chars > maxChars * 0.9;
  const wordError = maxWords && stats.words > maxWords;
  const charError = maxChars && stats.chars > maxChars;

  return (
    <div
      style={{
        display: 'flex',
        gap: '1rem',
        fontSize: '0.75rem',
        marginTop: '0.25rem',
      }}
    >
      <span
        style={{
          color: wordError ? '#ef4444' : wordWarning ? '#f59e0b' : '#64748b',
          fontWeight: wordWarning || wordError ? 500 : 400,
        }}
      >
        {stats.words} words
        {maxWords && ` / ${maxWords}`}
      </span>
      <span
        style={{
          color: charError ? '#ef4444' : charWarning ? '#f59e0b' : '#64748b',
          fontWeight: charWarning || charError ? 500 : 400,
        }}
      >
        {stats.chars} chars
        {maxChars && ` / ${maxChars}`}
      </span>
    </div>
  );
}
