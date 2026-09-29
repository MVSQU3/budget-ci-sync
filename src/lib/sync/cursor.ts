export type Watermark = { updatedAt: Date; id: string };

/**
 * Row is strictly after a `(updatedAt, id)` cursor.
 * `since` (no id) is exclusive on the timestamp alone.
 */
export function isAfterWatermark(
  row: { updatedAt: Date; id: string },
  watermark: Watermark | Date | null,
): boolean {
  if (watermark === null) return true;
  if (watermark instanceof Date) {
    return row.updatedAt.getTime() > watermark.getTime();
  }
  const rowTime = row.updatedAt.getTime();
  const markTime = watermark.updatedAt.getTime();
  if (rowTime > markTime) return true;
  if (rowTime < markTime) return false;
  return row.id > watermark.id;
}
