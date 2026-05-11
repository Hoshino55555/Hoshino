import React from 'react';
import { View, Image, StyleSheet, type LayoutChangeEvent } from 'react-native';
import {
    type RoomBand,
    type RoomItem,
    type RoomLayout,
    STARTER_ROOM_LAYOUT,
    WALL_BAND_FRACTION,
    ROOM_INTERIOR,
    ROOM_INTERIOR_W_FRACTION,
    ROOM_INTERIOR_H_FRACTION,
    containedRect,
    effectiveAspect,
    effectiveSpan,
    gridFor,
    itemPixelRect,
    resolveRoomAsset,
} from '../../services/RoomLayout';
import { Rooms } from '../../assets';

interface Props {
    /** Layout to render. Defaults to the starter mockup until persistence + editor land. */
    layout?: RoomLayout;
    /** Temporarily hidden while the editor renders the drag ghost for this item. */
    hiddenItemId?: string | null;
    /** When true, paint the grid + band divider behind the items so the editor
        affordance reads through without occluding decor. */
    editing?: boolean;
}

// View-only Room renderer. Two layers from back to front:
//   1) frame  — the new baseroom paints the wall band + brick floor in one
//               full-canvas bitmap, so a separate wall layer is no longer needed
//   2) items  — each layout entry positioned within its band's grid
//
// Item positioning happens inside band-clipped overlays (overflow: hidden)
// so cosmetics with span overflow stay inside their own band rather than
// leaking across the wall/floor boundary.
//
// Grid → pixels is delegated to `itemPixelRect` from RoomLayout so the
// future drag editor inverts the same math the renderer applies.
const Room: React.FC<Props> = ({
    layout = STARTER_ROOM_LAYOUT,
    hiddenItemId = null,
    editing = false,
}) => {
    const [size, setSize] = React.useState<{ w: number; h: number } | null>(null);

    const onLayout = (e: LayoutChangeEvent) => {
        const { width, height } = e.nativeEvent.layout;
        if (!size || size.w !== width || size.h !== height) {
            setSize({ w: width, h: height });
        }
    };

    const interiorLeft = size ? size.w * ROOM_INTERIOR.leftFraction : 0;
    const interiorTop = size ? size.h * ROOM_INTERIOR.topFraction : 0;
    const interiorW = size ? size.w * ROOM_INTERIOR_W_FRACTION : 0;
    const interiorH = size ? size.h * ROOM_INTERIOR_H_FRACTION : 0;
    const wallHeight = interiorH * WALL_BAND_FRACTION;
    const floorHeight = interiorH - wallHeight;
    const bandWidth = interiorW;

    const visibleLayout = hiddenItemId
        ? layout.filter((it) => it.id !== hiddenItemId)
        : layout;

    const wallItems = visibleLayout
        .filter((it) => it.band === 'wall')
        .sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
    const floorItems = visibleLayout
        .filter((it) => it.band === 'floor')
        .sort((a, b) => (a.z ?? 0) - (b.z ?? 0));

    return (
        <View style={styles.root} onLayout={onLayout}>
            <Image source={Rooms.frame.default} style={styles.fullCanvas} resizeMode="cover" />

            {size && editing && (
                <>
                    {renderGrid('wall', interiorTop, wallHeight, interiorW, interiorLeft)}
                    {renderGrid(
                        'floor',
                        interiorTop + wallHeight,
                        floorHeight,
                        interiorW,
                        interiorLeft,
                    )}
                </>
            )}

            {size && (
                <View
                    style={[
                        styles.bandLayer,
                        {
                            left: interiorLeft,
                            width: interiorW,
                            top: interiorTop,
                            height: wallHeight,
                        },
                    ]}
                    pointerEvents="none"
                >
                    {wallItems.map((it) => renderItem(it, bandWidth, wallHeight))}
                </View>
            )}

            {size && (
                <View
                    style={[
                        styles.bandLayer,
                        {
                            left: interiorLeft,
                            width: interiorW,
                            top: interiorTop + wallHeight,
                            height: floorHeight,
                        },
                    ]}
                    pointerEvents="none"
                >
                    {floorItems.map((it) => renderItem(it, bandWidth, floorHeight))}
                </View>
            )}
        </View>
    );
};

// Grid lines render as runs of elongated dashes (perforation feel) rather
// than solid 1px lines. RN's `borderStyle: 'dashed'` is unreliable on
// Android (often falls back to solid) so dashes are laid out manually.
const GRID_DASH_LEN = 10;
const GRID_DASH_THICK = 2;
const GRID_DASH_GAP = 6;
const GRID_DASH_STEP = GRID_DASH_LEN + GRID_DASH_GAP;

function pushDashedLine(
    out: React.ReactElement[],
    keyPrefix: string,
    horizontal: boolean,
    lineLeft: number,
    lineTop: number,
    length: number,
) {
    const count = Math.max(1, Math.floor((length + GRID_DASH_GAP) / GRID_DASH_STEP));
    const used = count * GRID_DASH_LEN + (count - 1) * GRID_DASH_GAP;
    const slack = Math.max(0, (length - used) / 2);
    for (let i = 0; i < count; i++) {
        const off = slack + i * GRID_DASH_STEP;
        out.push(
            <View
                key={`${keyPrefix}-${i}`}
                style={[
                    styles.gridDash,
                    horizontal
                        ? {
                              left: lineLeft + off,
                              top: lineTop,
                              width: GRID_DASH_LEN,
                              height: GRID_DASH_THICK,
                          }
                        : {
                              left: lineLeft,
                              top: lineTop + off,
                              width: GRID_DASH_THICK,
                              height: GRID_DASH_LEN,
                          },
                ]}
            />,
        );
    }
}

function renderGrid(
    band: RoomBand,
    top: number,
    height: number,
    width: number,
    left: number,
) {
    const grid = gridFor(band);
    const cellW = width / grid.cols;
    const cellH = height / grid.rows;
    const lines: React.ReactElement[] = [];
    for (let i = 1; i < grid.cols; i++) {
        const x = left + i * cellW - GRID_DASH_THICK / 2;
        pushDashedLine(lines, `${band}-v${i}`, false, x, top, height);
    }
    for (let i = 1; i < grid.rows; i++) {
        const y = top + i * cellH - GRID_DASH_THICK / 2;
        pushDashedLine(lines, `${band}-h${i}`, true, left, y, width);
    }
    if (band === 'floor') {
        lines.push(
            <View
                key="band-divider"
                style={[styles.bandDivider, { left, top, width }]}
            />,
        );
    }
    return <React.Fragment key={`grid-${band}`}>{lines}</React.Fragment>;
}

function renderItem(item: RoomItem, bandWidth: number, bandHeight: number) {
    // Effective span = rotated cell footprint; effective aspect = visible
    // aspect after the rotate transform. Combined, they let us place the
    // Image so its on-screen bounds match a 0°/90°/180°/270° item identically.
    const effSpan = effectiveSpan(item);
    const cell = itemPixelRect({ ...item, span: effSpan }, bandWidth, bandHeight);
    const sprite = containedRect(cell.width, cell.height, effectiveAspect(item.asset, item.rotation));
    const rot = item.rotation ?? 0;
    const swap = rot === 1 || rot === 3;
    // The Image element is drawn at the *native* aspect (pre-rotation), then
    // the rotate transform spins it around its center. For odd quarter-turns
    // the underlying box is the sprite's swapped dims so the rotated result
    // fills the visual rect exactly.
    const imgW = swap ? sprite.height : sprite.width;
    const imgH = swap ? sprite.width : sprite.height;
    const visualLeft = cell.left + sprite.dx;
    const visualTop = cell.top + sprite.dy;
    return (
        <Image
            key={item.id}
            source={resolveRoomAsset(item.asset)}
            style={[
                styles.item,
                {
                    left: visualLeft + (sprite.width - imgW) / 2,
                    top: visualTop + (sprite.height - imgH) / 2,
                    width: imgW,
                    height: imgH,
                    transform: rot ? [{ rotate: `${rot * 90}deg` }] : undefined,
                },
            ]}
        />
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        width: '100%',
        position: 'relative',
        overflow: 'hidden',
    },
    fullCanvas: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        // Explicit 100% dims force Android's native ImageView to a definite
        // frame — without these, absolute edges alone can fall back to
        // intrinsic bitmap size and ignore resizeMode, leaving the 1200×2672
        // assets rendering at native pixels (upper-left visible only).
        width: '100%',
        height: '100%',
    },
    bandLayer: {
        position: 'absolute',
        overflow: 'hidden',
    },
    item: {
        position: 'absolute',
    },
    gridDash: {
        position: 'absolute',
        backgroundColor: 'rgba(70, 40, 30, 0.32)',
    },
    bandDivider: {
        position: 'absolute',
        height: 2,
        backgroundColor: 'rgba(70, 40, 30, 0.42)',
    },
});

export default Room;
