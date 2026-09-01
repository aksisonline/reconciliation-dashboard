import { Download, FileSpreadsheet } from "lucide-react";
import { Button } from "#/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { API_URL } from "#/lib/api";

const EXPORTS = [
  { href: "/api/export/report.csv", label: "Reconciliation report" },
  { href: "/api/export/orders.csv", label: "Final orders.csv" },
  { href: "/api/export/payments.csv", label: "Final payments.csv" },
];

/** Direct links to the export endpoints — the session cookie rides along on a plain
 * navigation (SameSite=None; Secure), so no fetch/blob dance is needed; the server's
 * Content-Disposition: attachment header triggers the browser's native download. */
export function ExportMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline">
          <Download /> Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {EXPORTS.map((e) => (
          <DropdownMenuItem key={e.href} asChild>
            <a href={`${API_URL}${e.href}`}>
              <FileSpreadsheet /> {e.label}
            </a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
