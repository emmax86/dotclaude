export function toSlug(branch: string): string {
  return branch.replaceAll("/", "-");
}
