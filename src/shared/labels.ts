/**
 * Shared display-label helpers (pure, DOM/Node-free) so the engine, the drawing
 * builders, the renderer and the PDF exporter all format identities identically.
 */

/**
 * Display label for a panel: "TAG — Name" when a short tag/designation is set,
 * otherwise just the descriptive name. A blank/whitespace tag is ignored.
 */
export function panelLabel(panel: { tag?: string; name: string }): string {
  const tag = panel.tag?.trim();
  return tag ? `${tag} — ${panel.name}` : panel.name;
}
