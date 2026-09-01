import { useState } from "react";
import { CheckCircle2, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "#/components/ui/button";
import { Badge } from "#/components/ui/badge";
import { Textarea } from "#/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { api, ApiError } from "#/lib/api";
import { RESOLUTION_PRESETS, presetAction, type ResolutionPreset } from "#/lib/copy";
import type { Discrepancy, ResolveAction } from "#/lib/types";

const RESOLUTION_TYPE_LABEL: Record<string, string> = {
  EDIT: "Data corrected",
  EXCLUDE: "Excluded from reconciliation",
  NOTE: "Noted",
};

/** Manual (or "AI-guided" — presets are framed around the same reasoning Explain already
 * gives) resolution for one discrepancy. The AI chat never calls the resolve endpoint itself —
 * every apply here is a human click, by design (see the plan's addendum). */
export function ResolveDiscrepancy({
  discrepancy,
  onResolved,
}: {
  discrepancy: Discrepancy;
  onResolved: (updated: Discrepancy) => void;
}) {
  const [applying, setApplying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noteDraftFor, setNoteDraftFor] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [customNote, setCustomNote] = useState("");
  const [showCustom, setShowCustom] = useState(false);

  const order = discrepancy.order;
  const payment = discrepancy.payment;
  const isResolved = order?.resolutionStatus === "resolved" || payment?.resolutionStatus === "resolved";
  const resolutionType = order?.resolutionType ?? payment?.resolutionType ?? null;
  const resolutionNote = order?.resolutionNote ?? payment?.resolutionNote ?? null;
  const resolvedAt = order?.resolvedAt ?? payment?.resolvedAt ?? null;

  async function apply(id: string, action: ResolveAction | null) {
    if (!action) {
      setError("That option doesn't apply here — there's no matching row on that side.");
      return;
    }
    setApplying(id);
    setError(null);
    try {
      const updated = await api.post<Discrepancy>(`/api/discrepancies/${discrepancy.id}/resolve`, { action });
      onResolved(updated);
      setNoteDraftFor(null);
      setShowCustom(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't apply that resolution.");
    } finally {
      setApplying(null);
    }
  }

  async function undo() {
    setApplying("undo");
    setError(null);
    try {
      const updated = await api.post<Discrepancy>(`/api/discrepancies/${discrepancy.id}/unresolve`, undefined);
      onResolved(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't undo that.");
    } finally {
      setApplying(null);
    }
  }

  function clickPreset(preset: ResolutionPreset) {
    if (preset.primitive === "note") {
      setNoteDraftFor(preset.id);
      setNoteText(preset.defaultNote);
      return;
    }
    apply(preset.id, presetAction(preset, discrepancy));
  }

  if (isResolved) {
    return (
      <Alert>
        <CheckCircle2 className="text-chart-2" />
        <AlertTitle className="flex items-center gap-2">
          Resolved
          {resolutionType && (
            <Badge variant="outline" className="font-normal">
              {RESOLUTION_TYPE_LABEL[resolutionType] ?? resolutionType}
            </Badge>
          )}
        </AlertTitle>
        <AlertDescription className="flex flex-col gap-2">
          {resolutionNote && <p>{resolutionNote}</p>}
          {resolvedAt && <p className="text-xs">{new Date(resolvedAt).toLocaleString()}</p>}
          {resolutionType === "EDIT" && (
            <p className="text-xs">Undo clears this status marker only — the data change itself stays applied.</p>
          )}
          <Button size="sm" variant="outline" className="w-fit" onClick={undo} disabled={applying === "undo"}>
            <RotateCcw /> {applying === "undo" ? "Undoing…" : "Undo"}
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  const presets = discrepancy.discrepancyType ? RESOLUTION_PRESETS[discrepancy.discrepancyType] : [];

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Pick how to resolve this — each option updates the record and exports will reflect it.
      </p>

      <div className="flex flex-col gap-2">
        {presets.map((preset) => (
          <div key={preset.id} className="flex flex-col gap-2">
            <Button
              variant="outline"
              className="justify-start"
              onClick={() => clickPreset(preset)}
              disabled={applying !== null}
            >
              <Sparkles className="opacity-60" />
              {applying === preset.id ? "Applying…" : preset.label}
            </Button>
            {noteDraftFor === preset.id && (
              <div className="flex flex-col gap-2 rounded-md border p-3">
                <Textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={2} />
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setNoteDraftFor(null)}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={() => apply(preset.id, presetAction(preset, discrepancy, noteText))} disabled={!noteText.trim()}>
                    Apply
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {!showCustom ? (
        <Button size="sm" variant="ghost" className="w-fit" onClick={() => setShowCustom(true)}>
          Or add a custom note
        </Button>
      ) : (
        <div className="flex flex-col gap-2 rounded-md border p-3">
          <Textarea
            value={customNote}
            onChange={(e) => setCustomNote(e.target.value)}
            placeholder="What did you decide, and why?"
            rows={2}
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setShowCustom(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() =>
                apply("custom-note", { kind: "note", target: order ? "order" : "payment", note: customNote })
              }
              disabled={!customNote.trim()}
            >
              Mark resolved
            </Button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
