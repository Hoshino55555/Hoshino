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
}

export type RoomLayout = ReadonlyArray<RoomItem>;

// Band heights are expressed as a fraction of the room's interior. The wall
// is the top band; the floor takes the remainder. Tuning these here moves
// every grid cell in lockstep, which is what we want — items shouldn't
// drift relative to the band they live in.
export const WALL_BAND_FRACTION = 0.30;

// Per-band grid dimensions. 12 cols across both bands so horizontal positions
// can read consistently between wall and floor; rows differ because the floor
// is taller. Cells aren't square — that's fine; `span` lets items claim
// rectangles, and the hand-tuned starter layout matches the mockup.
export const WALL_GRID = { cols: 12, rows: 6 } as const;
export const FLOOR_GRID = { cols: 12, rows: 12 } as const;

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
    'floor.carpet': Rooms.floor.carpet,
    'floor.bed': Rooms.floor.bed,
    'floor.desk': Rooms.floor.desk,
    'floor.plant': Rooms.floor.plant,
    'minis.aro': Rooms.minis.aro,
};

const ASSET_TABLE = new Map<string, ReturnType<typeof require>>(
    Object.entries(ASSET_RECORD),
);

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
    { id: 'poster1-1', asset: 'decals.poster1', band: 'wall', gx: 2, gy: 2, span: { w: 2, h: 2 } },
    { id: 'window-1', asset: 'decals.window', band: 'wall', gx: 7, gy: 2, span: { w: 1, h: 2 } },
    { id: 'poster2-1', asset: 'decals.poster2', band: 'wall', gx: 9, gy: 2, span: { w: 2, h: 2 } },
    { id: 'carpet-1', asset: 'floor.carpet', band: 'floor', gx: 4, gy: 4, span: { w: 4, h: 4 } },
    { id: 'bed-1', asset: 'floor.bed', band: 'floor', gx: 0, gy: 5, span: { w: 3, h: 4 } },
    { id: 'desk-1', asset: 'floor.desk', band: 'floor', gx: 9, gy: 5, span: { w: 3, h: 3 } },
    { id: 'plant-1', asset: 'floor.plant', band: 'floor', gx: 9, gy: 1, span: { w: 1, h: 2 } },
    { id: 'aro-1', asset: 'minis.aro', band: 'floor', gx: 5, gy: 1, span: { w: 2, h: 3 } },
];
