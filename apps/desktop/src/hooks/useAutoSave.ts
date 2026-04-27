import type { ExtractionResult } from '@ara/shared';
import { useEffect } from 'react';

import { startAutoSave, stopAutoSave, clearDraft, saveDraft } from '../utils/autoSave';

export function useAutoSave(
  form: ExtractionResult['form'],
  rawText: string,
  enabled: boolean = true
) {
  useEffect(() => {
    if (!enabled) {
      stopAutoSave();
      return;
    }

    startAutoSave(() => ({ form, rawText }));

    return () => {
      stopAutoSave();
    };
  }, [form, rawText, enabled]);

  return {
    clear: clearDraft,
    save: () => saveDraft(form, rawText),
  };
}
