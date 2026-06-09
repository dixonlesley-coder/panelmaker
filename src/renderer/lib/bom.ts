/**
 * Re-export of the shared (pure) BOM derivation/costing helpers.
 *
 * The builder + rating heuristics moved to `@shared/engine` so the main process
 * (PDF quotation / project-BOM export) and the renderer (live costing) build the
 * same bill of materials. This module keeps the renderer's existing
 * `@renderer/lib/bom` import paths stable.
 */

export {
  buildPanelBom,
  buildSystemBom,
  costPanel,
  costSystem,
  costSystemConsolidated,
} from '@shared/engine';
