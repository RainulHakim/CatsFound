const dateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

/** "Oct 12". found_at is a calendar date, so format it in UTC to avoid off-by-one. */
export function formatFoundDate(date: string | Date): string {
  return dateFmt.format(
    typeof date === "string" ? new Date(`${date.slice(0, 10)}T00:00:00Z`) : date,
  );
}

export function article(noun: string): string {
  return /^[aeiou]/i.test(noun) ? "An" : "A";
}

/** "Black water bottle found in Chambers" — used as alt text (SPEC §11). */
export function photoAlt(item: {
  category_name: string;
  color_tags: string[];
  building_name: string;
}) {
  const colour = item.color_tags[0] ? `${item.color_tags[0]} ` : "";
  const what = `${colour}${item.category_name.split(" / ")[0]!.toLowerCase()}`;
  return `${what.charAt(0).toUpperCase()}${what.slice(1)} found in ${item.building_name}`;
}

export function photoSrc(photoId: string, width: number): string {
  return `/api/photos/${photoId}/${width}`;
}

export function photoSrcSet(photoId: string, variants: number[]): string {
  return variants.map((w) => `${photoSrc(photoId, w)} ${w}w`).join(", ");
}
