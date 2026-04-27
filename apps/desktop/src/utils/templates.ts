export interface Template {
  id: string;
  category: string;
  label: string;
  text: string;
}

export const DEFAULT_TEMPLATES: Template[] = [
  // Observations
  {
    id: 'obs-1',
    category: 'Observations',
    label: 'Client doing well',
    text: 'Client was well-groomed and dressed appropriately. Mood was positive and engaged during visit.',
  },
  {
    id: 'obs-2',
    category: 'Observations',
    label: 'Home clean and safe',
    text: 'Home environment was clean, well-maintained, and free of safety hazards. Adequate food and supplies noted.',
  },
  {
    id: 'obs-3',
    category: 'Observations',
    label: 'Client declined visit',
    text: 'Client declined visit today. Will follow up per protocol.',
  },

  // Health Status
  {
    id: 'health-1',
    category: 'Health Status',
    label: 'No health changes',
    text: 'No changes in health status reported. Taking medications as prescribed. No concerns at this time.',
  },
  {
    id: 'health-2',
    category: 'Health Status',
    label: 'Medication review',
    text: 'Medications reviewed with client. Compliance remains good. No new prescriptions or changes noted.',
  },
  {
    id: 'health-3',
    category: 'Health Status',
    label: 'Doctor appointment',
    text: 'Client has upcoming doctor appointment scheduled for [DATE]. Will follow up after visit.',
  },
  {
    id: 'health-4',
    category: 'Health Status',
    label: 'Fall reported',
    text: 'Client reported a fall on [DATE]. No injuries sustained. Fall prevention education provided. Physician notified.',
  },

  // Services
  {
    id: 'services-1',
    category: 'Services',
    label: 'Services adequate',
    text: 'Current services are meeting client needs. No changes recommended at this time.',
  },
  {
    id: 'services-2',
    category: 'Services',
    label: 'Increase services',
    text: 'Recommended increasing [SERVICE] hours due to [REASON]. Authorization request submitted.',
  },
  {
    id: 'services-3',
    category: 'Services',
    label: 'New service needed',
    text: 'Identified need for [SERVICE]. Referral submitted to [AGENCY]. Awaiting response.',
  },

  // Goals
  {
    id: 'goals-1',
    category: 'Goals',
    label: 'Progress on track',
    text: 'Client continues to make progress toward established goals. Goals remain appropriate.',
  },
  {
    id: 'goals-2',
    category: 'Goals',
    label: 'Goal met',
    text: 'Goal [DESCRIPTION] has been met. Discussed new goal with client and care team.',
  },
  {
    id: 'goals-3',
    category: 'Goals',
    label: 'Goal modified',
    text: 'Goal modified based on client current status and preferences. New timeline established.',
  },

  // Follow Up
  {
    id: 'follow-1',
    category: 'Follow Up',
    label: 'Call provider',
    text: 'Contact physician regarding [ISSUE].',
  },
  {
    id: 'follow-2',
    category: 'Follow Up',
    label: 'Schedule visit',
    text: 'Schedule next monitoring visit for [TIMEFRAME].',
  },
  {
    id: 'follow-3',
    category: 'Follow Up',
    text: 'Follow up on referral status for [SERVICE].',
    label: 'Check referral',
  },
];

const CUSTOM_TEMPLATES_KEY = 'ara_custom_templates';

export function getCustomTemplates(): Template[] {
  try {
    const stored = localStorage.getItem(CUSTOM_TEMPLATES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function saveCustomTemplate(template: Omit<Template, 'id'>): Template {
  const templates = getCustomTemplates();
  const newTemplate: Template = { ...template, id: `custom-${Date.now()}` };
  templates.push(newTemplate);
  localStorage.setItem(CUSTOM_TEMPLATES_KEY, JSON.stringify(templates));
  return newTemplate;
}

export function deleteCustomTemplate(id: string): void {
  const templates = getCustomTemplates().filter(t => t.id !== id);
  localStorage.setItem(CUSTOM_TEMPLATES_KEY, JSON.stringify(templates));
}

export function getAllTemplates(): Template[] {
  return [...DEFAULT_TEMPLATES, ...getCustomTemplates()];
}

export function getTemplatesByCategory(): Record<string, Template[]> {
  const all = getAllTemplates();
  const grouped: Record<string, Template[]> = {};

  for (const template of all) {
    if (!grouped[template.category]) {
      grouped[template.category] = [];
    }
    grouped[template.category].push(template);
  }

  return grouped;
}
