// Grid-based room layout for the decoratable Room page.
//
// The room is split into two stacked **bands**: a `wall` band at the top and
// a `floor` band below. Each band has its own grid coordinate space so wall
// decals stay anchored to the wall even if the wall/floor split changes, and
// floor cosmetics stay anchored to the floor. The renderer translates grid
// cells into pixels at draw time using the band's measured size — layouts
// are device-independent.
//
// Items are stored as `{asset, band, gx, gy, span}` records so the future
// editor can mutate position by writing back to the same array. View-only
// rendering and editor mutation share one schema.

import { Rooms } from '../assets';

export type RoomBand = 'wall' | 'floor';

// Quarter turns clockwise. Items rotate around their visual center so a 90°
// turn doesn't drag the sprite off its cell — but the *occupied* cell
// footprint swaps w/h, so a 3×5 bed becomes 5×3 on the grid.
export type RoomRotation = 0 | 1 | 2 | 3;

// Asset keys are dotted strings into the Rooms namespace. Two disjoint sets:
//   - BackgroundAssetKey: rendered as full-canvas layers. The new baseroom
//     paints both wall + floor in one bitmap so there is only one entry now.
//   - RoomItemAssetKey: placeable cosmetics that live inside a band's grid.
//
// Keeping them disjoint at the type level prevents `RoomItem.asset =
// 'frame.default'` typos from compiling, which would otherwise paint the
// frame on top of itself inside the wall band.
export type BackgroundAssetKey = 'frame.default';

export type RoomItemAssetKey =
    | 'decals.poster1'
    | 'decals.poster2'
    | 'decals.window'
    | 'decals.lights'
    | 'floor.carpet'
    | 'floor.bed'
    | 'floor.desk'
    | 'floor.plant'
    | 'minis.aro';

export type RoomAssetKey = BackgroundAssetKey | RoomItemAssetKey;

export interface RoomItem {
    /** Stable instance id — distinct from asset key so two posters can coexist. */
    id: string;
    asset: RoomItemAssetKey;
    band: RoomBand;
    /** Top-left grid cell (0-indexed). */
    gx: number;
    gy: number;
    /** Cells the item occupies. Defaults to 1×1. */
    span?: { w: number; h: number };
    /** Stacking within the band; higher draws later. Defaults to 0. */
    z?: number;
    /** Quarter turns clockwise (0..3). Defaults to 0. Swaps effective span w/h on odd values. */
    rotation?: RoomRotation;
}

// Effective span = the cell footprint the item occupies *after* rotation.
// `gx`/`gy` always reference the top-left of this footprint, so odd-rotation
// items have their w/h swapped for grid math (drop preview, cell clamping,
// overlap math if we ever add it).
export function effectiveSpan(item: Pick<RoomItem, 'span' | 'rotation'>): { w: number; h: number } {
    const base = item.span ?? { w: 1, h: 1 };
    const r = item.rotation ?? 0;
    return r === 1 || r === 3 ? { w: base.h, h: base.w } : base;
}

// Effective aspect = the visual aspect of the *rotated* sprite. Inverts the
// native aspect on odd rotations so containedRect picks a bounding box that
// matches what the user sees after the rotate transform is applied.
export function effectiveAspect(asset: RoomItemAssetKey, rotation: RoomRotation | undefined): number {
    const base = ROOM_ITEM_ASPECT[asset];
    const r = rotation ?? 0;
    return r === 1 || r === 3 ? 1 / base : base;
}

export type RoomLayout = ReadonlyArray<RoomItem>;

// The room-bg bitmap (1200×2672) has a brown decorative frame around the
// playable interior — the cream wall + brick floor only fill ~87% of the
// canvas width and ~89% of the height. Grid coordinates address that
// interior, not the full canvas, so dropping a poster at gy=0 lands at the
// top of the cream area instead of inside the painted frame.
export const ROOM_INTERIOR = {
    leftFraction: 0.065,
    rightFraction: 0.065,
    topFraction: 0.080,
    bottomFraction: 0.1575,
} as const;
export const ROOM_INTERIOR_W_FRACTION =
    1 - ROOM_INTERIOR.leftFraction - ROOM_INTERIOR.rightFraction;
export const ROOM_INTERIOR_H_FRACTION =
    1 - ROOM_INTERIOR.topFraction - ROOM_INTERIOR.bottomFraction;

// Wall band occupies the top of the interior (the cream area in room-bg).
// Tuned so both edges of the band sit on the painted wall — the top edge
// matches the cream-vs-frame seam and the band divider matches the
// wall/floor seam.
export const WALL_BAND_FRACTION = 0.2416;

// Grid density tuned so cells are roughly square in interior pixel space.
// Wall is short and wide; floor is tall — keeping 12 cols across both lets
// horizontal positions read consistently between bands.
//   Wall:  12 × 5  → cells ≈ square
//   Floor: 12 × 19 → cells ≈ square
export const WALL_GRID = { cols: 12, rows: 5 } as const;
export const FLOOR_GRID = { cols: 12, rows: 19 } as const;

export function gridFor(band: RoomBand) {
    return band === 'wall' ? WALL_GRID : FLOOR_GRID;
}

// Two-step registry:
//   - `ASSET_RECORD` is typed as `Record<RoomAssetKey, ...>` so adding a key
//     to either union without registering it here is a compile error
//     (exhaustiveness, not just key validity).
//   - `ASSET_TABLE` mirrors that into a Map so runtime lookups with
//     untrusted strings (server payloads, persisted layouts) cannot reach
//     prototype-chain properties like `toString`.
const ASSET_RECORD: Record<RoomAssetKey, ReturnType<typeof require>> = {
    'frame.default': Rooms.frame.default,
    'decals.poster1': Rooms.decals.poster1,
    'decals.poster2': Rooms.decals.poster2,
    'decals.window': Rooms.decals.window,
    'decals.lights': Rooms.decals.lights,
    'floor.carpet': Rooms.floor.carpet,
    'floor.bed': Rooms.floor.bed,
    'floor.desk': Rooms.floor.desk,
    'floor.plant': Rooms.floor.plant,
    'minis.aro': Rooms.minis.aro,
};

const ASSET_TABLE = new Map<string, ReturnType<typeof require>>(
    Object.entries(ASSET_RECORD),
);

// Natural aspect ratio (w/h) of each room item sprite. Used to compute the
// painted sub-rect inside a cell-bounded box: `resizeMode="contain"` letterboxes
// the image, so a bed (43×66) placed in a 3×7 cell-box has tall empty bands
// above/below the sprite — overlays (placement highlight, drop preview)
// rendered against the bounding box look wildly bigger than the art.
export const ROOM_ITEM_ASPECT: Record<RoomItemAssetKey, number> = {
    'decals.poster1': 18 / 26,
    'decals.poster2': 15 / 22,
    'decals.window': 44 / 43,
    'decals.lights': 1,
    'floor.carpet': 67 / 32,
    'floor.bed': 43 / 66,
    'floor.desk': 43 / 46,
    'floor.plant': 20 / 31,
    'minis.aro': 128 / 184,
};

// Inset an aspect-correct sprite inside its bounding box. Horizontally
// centered, vertically top-anchored — `gy` directly controls where the top
// of the painted sprite lands, so a floor item at gy=0 sits flush against
// the wall/floor band divider. Renderer paints the Image at this exact
// rect (no `resizeMode="contain"` letterboxing) so editor highlights and
// the drag preview line up pixel-for-pixel with the artwork.
export function containedRect(
    boundsW: number,
    boundsH: number,
    aspect: number,
): { dx: number; dy: number; width: number; height: number } {
    const boundsAspect = boundsW / boundsH;
    if (aspect > boundsAspect) {
        const width = boundsW;
        const height = boundsW / aspect;
        return { dx: 0, dy: 0, width, height };
    }
    const height = boundsH;
    const width = boundsH * aspect;
    return { dx: (boundsW - width) / 2, dy: 0, width, height };
}

// Fallback for unknown keys — paints poster1 so a missing cosmetic shows
// as a clearly placeholder shape rather than rendering nothing (which can
// look like a broken sprite or a dropped item).
const FALLBACK_ASSET = Rooms.decals.poster1;

export function resolveRoomAsset(key: string) {
    return ASSET_TABLE.get(key) ?? FALLBACK_ASSET;
}

// Grid → pixel translation for a single item inside its band. Exported so
// the editor (and any future hit-testing for taps) can compose with the
// same math the renderer uses; otherwise the inverse drag math drifts.
export interface PixelRect {
    left: number;
    top: number;
    width: number;
    height: number;
}

export function itemPixelRect(
    item: Pick<RoomItem, 'band' | 'gx' | 'gy' | 'span'>,
    bandWidth: number,
    bandHeight: number,
): PixelRect {
    const grid = gridFor(item.band);
    const cellW = bandWidth / grid.cols;
    const cellH = bandHeight / grid.rows;
    const span = item.span ?? { w: 1, h: 1 };
    return {
        left: item.gx * cellW,
        top: item.gy * cellH,
        width: span.w * cellW,
        height: span.h * cellH,
    };
}

// Starter layout matching the design mockup. Hand-tuned for view-only
// release — the editor will mutate this array (or a per-user copy) once it
// lands. Order in the array matches paint order for ties on `z`.
export const STARTER_ROOM_LAYOUT: RoomLayout = [
    { id: 'poster1-1', asset: 'decals.poster1', band: 'wall', gx: 1, gy: 0, span: { w: 2, h: 3 } },
    { id: 'window-1', asset: 'decals.window', band: 'wall', gx: 4, gy: 1, span: { w: 4, h: 4 } },
    { id: 'poster2-1', asset: 'decals.poster2', band: 'wall', gx: 9, gy: 0, span: { w: 2, h: 3 } },
    { id: 'carpet-1', asset: 'floor.carpet', band: 'floor', gx: 4, gy: 15, span: { w: 4, h: 2 } },
    { id: 'bed-1', asset: 'floor.bed', band: 'floor', gx: 0, gy: 12, span: { w: 3, h: 5 } },
    { id: 'desk-1', asset: 'floor.desk', band: 'floor', gx: 8, gy: 13, span: { w: 4, h: 4 } },
    { id: 'plant-1', asset: 'floor.plant', band: 'floor', gx: 9, gy: 3, span: { w: 2, h: 3 } },
    { id: 'aro-1', asset: 'minis.aro', band: 'floor', gx: 5, gy: 3, span: { w: 2, h: 3 } },
];
