/** The items of the last completion request, resolved up to some count; it only grows per request. */
export class ResolveCache<T> {
  private key = "";
  private count = 0;
  private cached: T[] = [];

  /** The resolve count to ask for so that the item at `index` is resolved, or null when it already is. */
  needed(key: string, index: number): number | null {
    return key === this.key && index < this.count ? null : index + 1;
  }

  store(key: string, count: number, items: T[]): void {
    this.key = key;
    this.count = count;
    this.cached = items;
  }

  items(key: string): T[] {
    return key === this.key ? this.cached : [];
  }

  clear(): void {
    this.key = "";
    this.count = 0;
    this.cached = [];
  }
}
