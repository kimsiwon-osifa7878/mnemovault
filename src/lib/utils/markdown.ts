export function toSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w가-힣-]/g, "")
    .replace(/-+/g, "-");
}

export function slugToTitle(slug: string): string {
  return slug.replace(/-/g, " ");
}
