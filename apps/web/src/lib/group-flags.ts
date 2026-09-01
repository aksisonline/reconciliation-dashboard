import { api } from "#/lib/api";
import type { OrderRecord, PaymentRecord } from "#/lib/types";

export type RowsResponse =
  | { source: "orders"; rows: OrderRecord[] }
  | { source: "payments"; rows: PaymentRecord[] };

export function loadGroupRows(flagId: string) {
  return api.get<RowsResponse>(`/api/ingest/flags/${flagId}/rows`);
}

/** Applies a keep/exclude decision for a compared group, then marks the flag acknowledged
 * so the list shows it's been resolved instead of silently going back to looking untouched. */
export async function applyGroupDecision(flagId: string, data: RowsResponse, keep: boolean[]) {
  const changed = data.rows
    .map((row, i) => ({ row, wantKeep: keep[i] }))
    .filter(({ row, wantKeep }) => wantKeep === row.isExcluded); // flipped from current state

  await Promise.all(
    changed.map(({ row, wantKeep }) => api.post(`/api/ingest/rows/${data.source}/${row.id}`, { isExcluded: !wantKeep })),
  );
  await api.post(`/api/ingest/flags/${flagId}/acknowledge`);

  return changed.length;
}
