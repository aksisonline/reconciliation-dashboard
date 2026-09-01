import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "#/components/ui/table";
import { Badge } from "#/components/ui/badge";
import { Checkbox } from "#/components/ui/checkbox";
import { buildCompareRows } from "#/lib/compare";
import type { RowsResponse } from "#/lib/group-flags";

export function CompareRowsTable({
  data,
  keep,
  onKeepChange,
}: {
  data: RowsResponse;
  keep: boolean[];
  onKeepChange: (index: number, value: boolean) => void;
}) {
  if (data.rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No matching rows found (they may have been excluded).</p>;
  }

  const compared = buildCompareRows(data.source, data.rows);

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Field</TableHead>
            {data.rows.map((_, i) => (
              <TableHead key={i}>Row {i + 1}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell className="font-medium text-muted-foreground">Keep this row?</TableCell>
            {data.rows.map((_, i) => (
              <TableCell key={i}>
                <Checkbox checked={keep[i] ?? true} onCheckedChange={(checked) => onKeepChange(i, checked === true)} />
              </TableCell>
            ))}
          </TableRow>
          {compared.map((row) => (
            <TableRow key={row.label}>
              <TableCell className="font-medium text-muted-foreground">{row.label}</TableCell>
              {row.values.map((v, i) => (
                <TableCell
                  key={i}
                  className={!keep[i] ? "text-muted-foreground line-through" : row.allSame ? undefined : "text-destructive"}
                >
                  {v}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {data.rows.length > 1 && (
        <div className="mt-3">
          {compared.every((r) => r.allSame) ? (
            <Badge variant="secondary">These rows are identical duplicates</Badge>
          ) : (
            <Badge variant="destructive">These rows differ — not a plain duplicate</Badge>
          )}
        </div>
      )}
    </div>
  );
}
