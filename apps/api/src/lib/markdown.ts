/** Renders LLM-authored markdown to HTML using Bun's native renderer for
 * display in the chat UI. The raw markdown stays the source of truth in the
 * DB; this is just a view-layer convenience computed on read. */
export function renderMarkdown(text: string): string {
  return Bun.markdown.html(text);
}
