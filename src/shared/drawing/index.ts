/**
 * Pure drawing builders barrel. DOM-free, Node-free string templating that turns
 * a computed panel into vector deliverables:
 *   - shared geometry primitives + GA/SLD layouts (`./geometry`, `./sld`),
 *   - standalone SVG strings for screen / PDF embed / `.svg` export (`./svg`),
 *   - minimal AutoCAD R12 ASCII DXF for `.dxf` export (`./dxf`).
 */

export * from './geometry';
export * from './sld';
export * from './svg';
