const malaysiaDate = new Intl.DateTimeFormat("en-MY", {
  timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit",
});

export function businessDate(timestamp: string): string {
  const parts = malaysiaDate.formatToParts(new Date(timestamp));
  const find = (name: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === name)?.value;
  return [find("year"), find("month"), find("day")].join("-");
}
