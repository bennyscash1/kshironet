export function SlotStatusIndicator({
  totalSlots,
  registeredCount,
}: {
  totalSlots: number | null;
  registeredCount: number;
}) {
  if (totalSlots === null) return null;

  const remaining = totalSlots - registeredCount;
  const isFull = remaining <= 0;

  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium">
      <span
        className={`inline-block size-2.5 rounded-sm ${isFull ? "bg-emerald-500" : "bg-rose-500"}`}
      />
      <span className={isFull ? "text-emerald-700" : "text-rose-700"}>
        {isFull ? "הסמכה מלאה" : `${remaining} הקצאות פנויות`}
      </span>
    </span>
  );
}
