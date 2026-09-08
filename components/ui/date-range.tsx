/** Formats a "YYYY-MM-DD" string as Hebrew-style dd/MM/yyyy (no timezone math). */
function formatDate(d: string) {
  const [year, month, day] = d.split("-");
  if (!year || !month || !day) return d;
  return `${day}/${month}/${year}`;
}

export function DateRange({ start, end }: { start: string; end?: string | null }) {
  return (
    <span dir="ltr" className="inline-block">
      {formatDate(start)}
      {end ? ` – ${formatDate(end)}` : ""}
    </span>
  );
}
