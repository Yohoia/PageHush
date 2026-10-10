export interface TopicOption {
  id?: string;
  name: string;
}

export function normalizeTaxonomyValue(value: string) {
  return value.replace(/^#+/, '').trim();
}
