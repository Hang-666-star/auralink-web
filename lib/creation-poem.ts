/**
 * A title is optional in the persisted structured-poem contract.  This is a
 * presentation fallback only: callers retain `null` in Creation data.
 */
export function poemTitleLabel(title: string | null): string {
  return title ?? "未题";
}
