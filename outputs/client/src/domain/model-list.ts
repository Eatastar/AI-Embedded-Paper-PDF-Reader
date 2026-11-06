export interface DiscoveredModel { id: string; label?: string }

const modelNames = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
/** Sort the actual API IDs naturally, keeping provider IDs and the input array intact. */
export function sortDiscoveredModels(models: readonly DiscoveredModel[]): DiscoveredModel[] {
  return [...models].sort((left, right) => modelNames.compare(left.id, right.id) || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
}
