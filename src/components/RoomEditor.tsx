import React, { useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    Image,
    TouchableOpacity,
    StyleSheet,
    LayoutChangeEvent,
    PanResponder,
    Animated,
    type GestureResponderEvent,
    type PanResponderGestureState,
    type ImageStyle,
} from 'react-native';
import {
    type RoomBand,
    type RoomItem,
    type RoomItemAssetKey,
    type RoomLayout,
    WALL_BAND_FRACTION,
    WALL_GRID,
    FLOOR_GRID,
    gridFor,
    itemPixelRect,
    resolveRoomAsset,
} from '../services/RoomLayout';

interface PaletteEntry {
    asset: RoomItemAssetKey;
    label: string;
    band: RoomBand;
    span: { w: number; h: number };
}

const PALETTE: PaletteEntry[] = [
    { asset: 'decals.cobweb', label: 'Cobweb', band: 'wall', span: { w: 2, h: 2 } },
    { asset: 'decals.porthole', label: 'Window', band: 'wall', span: { w: 1, h: 2 } },
    { asset: 'decals.bloodsplatter', label: 'Splat', band: 'wall', span: { w: 2, h: 2 } },
    { asset: 'floor.placemat', label: 'Mat', band: 'floor', span: { w: 4, h: 4 } },
    { asset: 'minis.aro', label: 'Aro', band: 'floor', span: { w: 2, h: 3 } },
];

interface RoomEditorProps {
    layout: RoomLayout;
    onChange: (next: RoomLayout) => void;
    /** Reserved space at the bottom (e.g. parent back button). The Edit chip
        and palette stack sit above this. */
    bottomInset?: number;
}

type DragSource =
    | { kind: 'palette'; asset: RoomItemAssetKey; band: RoomBand; span: { w: number; h: number } }
    | { kind: 'placed'; item: RoomItem };

interface DragMeta {
    asset: RoomItemAssetKey;
    band: RoomBand;
    span: { w: number; h: number };
    width: number;
    height: number;
}

let nextItemSerial = 1;
const newItemId = (asset: RoomItemAssetKey) =>
    `${asset}-${Date.now().toString(36)}-${nextItemSerial++}`;

const RoomEditor: React.FC<RoomEditorProps> = ({ layout, onChange, bottomInset = 0 }) => {
    const [size, setSize] = useState({ w: 0, h: 0 });
    const [editing, setEditing] = useState(false);
    // The active drag's display metadata. Non-null while a gesture is in
    // flight; rendering the ghost keys off this.
    const [dragMeta, setDragMeta] = useState<DragMeta | null>(null);
    // Hide the in-place sprite of a placed item while it's being dragged so
    // the ghost is the only visible representation. We *don't* mutate
    // `layout` for this — that would unmount the responder mid-gesture and
    // immediately terminate the drag.
    const [draggedId, setDraggedId] = useState<string | null>(null);
    // True while the finger is over the trash zone — drives the trash's
    // hover highlight so the user gets a confirm-on-release cue.
    const [trashHover, setTrashHover] = useState(false);

    const containerRef = useRef<View>(null);
    const containerOriginRef = useRef({ x: 0, y: 0 });
    // Source-of-truth for the active drag, accessed inside gesture
    // callbacks where setState is async/stale.
    const dragRef = useRef<{ source: DragSource; meta: DragMeta } | null>(null);
    const ghostPos = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

    const handleLayout = (e: LayoutChangeEvent) => {
        const { width, height } = e.nativeEvent.layout;
        setSize({ w: width, h: height });
        // Remeasure absolute origin so finger pageX/pageY → container-local
        // coords stays correct even after rotation/safe-area shifts.
        requestAnimationFrame(() => {
            containerRef.current?.measureInWindow((x, y) => {
                containerOriginRef.current = { x, y };
            });
        });
    };

    const wallHeight = size.h * WALL_BAND_FRACTION;
    const floorHeight = size.h - wallHeight;

    // Trash zone — top-center pill in container-local coords. Only shown
    // while dragging a placed item; release-over-trash deletes.
    const TRASH_W = 88;
    const TRASH_H = 48;
    const TRASH_TOP = 56; // below the back button / status bar
    const trashRect = useMemo(
        () => ({
            left: size.w / 2 - TRASH_W / 2,
            top: TRASH_TOP,
            right: size.w / 2 + TRASH_W / 2,
            bottom: TRASH_TOP + TRASH_H,
        }),
        [size.w],
    );

    const isOverTrash = (pageX: number, pageY: number) => {
        const x = pageX - containerOriginRef.current.x;
        const y = pageY - containerOriginRef.current.y;
        return (
            x >= trashRect.left &&
            x <= trashRect.right &&
            y >= trashRect.top &&
            y <= trashRect.bottom
        );
    };

    const ghostSizeFor = (band: RoomBand, span: { w: number; h: number }) => {
        const grid = gridFor(band);
        const bandH = band === 'wall' ? wallHeight : floorHeight;
        return {
            width: (size.w / grid.cols) * span.w,
            height: (bandH / grid.rows) * span.h,
        };
    };

    const dropTargetFor = (
        pageX: number,
        pageY: number,
        span: { w: number; h: number },
    ): { band: RoomBand; gx: number; gy: number } | null => {
        const localX = pageX - containerOriginRef.current.x;
        const localY = pageY - containerOriginRef.current.y;
        if (localX < 0 || localX > size.w || localY < 0 || localY > size.h) return null;
        const band: RoomBand = localY < wallHeight ? 'wall' : 'floor';
        const bandTop = band === 'wall' ? 0 : wallHeight;
        const bandHeight = band === 'wall' ? wallHeight : floorHeight;
        const grid = gridFor(band);
        const cellW = size.w / grid.cols;
        const cellH = bandHeight / grid.rows;
        const rawGx = Math.floor((localX - (span.w * cellW) / 2) / cellW);
        const rawGy = Math.floor((localY - bandTop - (span.h * cellH) / 2) / cellH);
        const gx = Math.max(0, Math.min(grid.cols - span.w, rawGx));
        const gy = Math.max(0, Math.min(grid.rows - span.h, rawGy));
        return { band, gx, gy };
    };

    const beginDrag = (source: DragSource, e: GestureResponderEvent) => {
        const { pageX, pageY } = e.nativeEvent;
        const band = source.kind === 'palette' ? source.band : source.item.band;
        const span = source.kind === 'palette' ? source.span : source.item.span ?? { w: 1, h: 1 };
        const asset = source.kind === 'palette' ? source.asset : source.item.asset;
        const { width, height } = ghostSizeFor(band, span);
        const meta: DragMeta = { asset, band, span, width, height };
        ghostPos.setValue({
            x: pageX - containerOriginRef.current.x - width / 2,
            y: pageY - containerOriginRef.current.y - height / 2,
        });
        dragRef.current = { source, meta };
        if (source.kind === 'placed') setDraggedId(source.item.id);
        setDragMeta(meta);
    };

    const updateDrag = (_e: GestureResponderEvent, g: PanResponderGestureState) => {
        const cur = dragRef.current;
        if (!cur) return;
        ghostPos.setValue({
            x: g.moveX - containerOriginRef.current.x - cur.meta.width / 2,
            y: g.moveY - containerOriginRef.current.y - cur.meta.height / 2,
        });
        if (cur.source.kind === 'placed') {
            setTrashHover(isOverTrash(g.moveX, g.moveY));
        }
    };

    const endDrag = (_e: GestureResponderEvent, g: PanResponderGestureState) => {
        const cur = dragRef.current;
        dragRef.current = null;
        setDraggedId(null);
        setDragMeta(null);
        setTrashHover(false);
        if (!cur) return;
        const { source } = cur;
        const span = source.kind === 'palette' ? source.span : source.item.span ?? { w: 1, h: 1 };
        // gestureState.moveX is 0 if no move occurred — fall back to the
        // grant point so a tap-and-release on a palette item lands at the
        // touch location instead of (0,0).
        const dropX = g.moveX || g.x0;
        const dropY = g.moveY || g.y0;

        if (source.kind === 'palette') {
            const drop = dropTargetFor(dropX, dropY, span);
            if (drop && drop.band === source.band) {
                onChange([
                    ...layout,
                    {
                        id: newItemId(source.asset),
                        asset: source.asset,
                        band: source.band,
                        gx: drop.gx,
                        gy: drop.gy,
                        span: source.span,
                    },
                ]);
            }
            return;
        }

        // Placed item — trash beats grid, so check trash first.
        if (isOverTrash(dropX, dropY)) {
            onChange(layout.filter((it) => it.id !== source.item.id));
            return;
        }
        const drop = dropTargetFor(dropX, dropY, span);
        // Outside grid or wrong band → leave in place (no layout change).
        if (!drop || drop.band !== source.item.band) return;
        // Same band, valid cell → reposition in place (preserve id/order).
        onChange(
            layout.map((it) =>
                it.id === source.item.id ? { ...it, gx: drop.gx, gy: drop.gy } : it,
            ),
        );
    };

    // One responder factory per role. `useMemo` keys off `editing`/size so the
    // closure sees current dimensions; mid-gesture we never re-run because
    // those don't change while a finger is down.
    const paletteResponders = useMemo(
        () =>
            PALETTE.map((entry) =>
                PanResponder.create({
                    onStartShouldSetPanResponder: () => editing && size.w > 0,
                    onMoveShouldSetPanResponder: () => editing && size.w > 0,
                    onPanResponderTerminationRequest: () => false,
                    onPanResponderGrant: (e) =>
                        beginDrag(
                            {
                                kind: 'palette',
                                asset: entry.asset,
                                band: entry.band,
                                span: entry.span,
                            },
                            e,
                        ),
                    onPanResponderMove: updateDrag,
                    onPanResponderRelease: endDrag,
                    onPanResponderTerminate: endDrag,
                }),
            ),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [editing, size.w, size.h],
    );

    const makePlacedResponder = (item: RoomItem) =>
        PanResponder.create({
            onStartShouldSetPanResponder: () => editing && size.w > 0,
            onMoveShouldSetPanResponder: () => editing && size.w > 0,
            onPanResponderTerminationRequest: () => false,
            onPanResponderGrant: (e) => beginDrag({ kind: 'placed', item }, e),
            onPanResponderMove: updateDrag,
            onPanResponderRelease: endDrag,
            onPanResponderTerminate: endDrag,
        });

    const sortedItems = useMemo(
        () => [...layout].sort((a, b) => (a.z ?? 0) - (b.z ?? 0)),
        [layout],
    );

    return (
        <View
            ref={containerRef}
            style={StyleSheet.absoluteFill}
            onLayout={handleLayout}
            pointerEvents="box-none"
        >
            {editing && size.w > 0 && (
                <>
                    {renderGrid('wall', 0, wallHeight, size.w)}
                    {renderGrid('floor', wallHeight, floorHeight, size.w)}
                </>
            )}

            {editing && size.w > 0 &&
                sortedItems.map((item) => {
                    const bandTop = item.band === 'wall' ? 0 : wallHeight;
                    const bandH = item.band === 'wall' ? wallHeight : floorHeight;
                    const rect = itemPixelRect(item, size.w, bandH);
                    const responder = makePlacedResponder(item);
                    const isDragged = draggedId === item.id;
                    return (
                        <View
                            key={item.id}
                            {...responder.panHandlers}
                            style={[
                                styles.placedOverlay,
                                {
                                    left: rect.left,
                                    top: rect.top + bandTop,
                                    width: rect.width,
                                    height: rect.height,
                                    opacity: isDragged ? 0 : 1,
                                },
                            ]}
                        >
                            <View style={styles.placedHighlight} />
                        </View>
                    );
                })}

            {/* Trash zone — only painted while a placed item is dragging.
                Hover-state highlight makes the destructive action feel
                committed before release. Non-interactive: hit-testing is
                done in pageX/pageY against trashRect. */}
            {dragMeta && draggedId && (
                <View
                    pointerEvents="none"
                    style={[
                        styles.trashZone,
                        {
                            left: trashRect.left,
                            top: trashRect.top,
                            width: TRASH_W,
                            height: TRASH_H,
                        },
                        trashHover && styles.trashZoneHover,
                    ]}
                >
                    <Text
                        style={[
                            styles.trashLabel,
                            trashHover && styles.trashLabelHover,
                        ]}
                    >
                        {trashHover ? 'Release to delete' : 'Drop to trash'}
                    </Text>
                </View>
            )}

            {dragMeta && (
                <Animated.View
                    pointerEvents="none"
                    style={[
                        styles.ghost,
                        {
                            width: dragMeta.width,
                            height: dragMeta.height,
                            transform: [
                                { translateX: ghostPos.x },
                                { translateY: ghostPos.y },
                            ],
                        },
                    ]}
                >
                    <Image
                        source={resolveRoomAsset(dragMeta.asset)}
                        style={styles.ghostImage as ImageStyle}
                        resizeMode="contain"
                    />
                </Animated.View>
            )}

            {editing && (
                <View
                    pointerEvents="box-none"
                    style={[styles.paletteWrap, { bottom: bottomInset + 56 }]}
                >
                    <View style={styles.paletteContent}>
                        {PALETTE.map((item, i) => (
                            <View
                                key={item.asset}
                                {...paletteResponders[i].panHandlers}
                                style={styles.paletteItem}
                            >
                                <Image
                                    source={resolveRoomAsset(item.asset)}
                                    style={styles.paletteImage as ImageStyle}
                                    resizeMode="contain"
                                />
                                <Text style={styles.paletteLabel}>{item.label}</Text>
                            </View>
                        ))}
                    </View>
                </View>
            )}

            <TouchableOpacity
                onPress={() => setEditing((prev) => !prev)}
                style={[
                    styles.editButton,
                    { bottom: bottomInset + 8 },
                    editing && styles.editButtonActive,
                ]}
            >
                <Text style={styles.editButtonText}>{editing ? 'Done' : 'Edit'}</Text>
            </TouchableOpacity>
        </View>
    );
};

function renderGrid(band: RoomBand, top: number, height: number, width: number) {
    const grid = gridFor(band);
    const cellW = width / grid.cols;
    const cellH = height / grid.rows;
    const lines: React.ReactElement[] = [];
    for (let i = 1; i < grid.cols; i++) {
        lines.push(
            <View
                key={`${band}-v${i}`}
                style={[styles.gridLine, { left: i * cellW, top, height, width: 1 }]}
            />,
        );
    }
    for (let i = 1; i < grid.rows; i++) {
        lines.push(
            <View
                key={`${band}-h${i}`}
                style={[styles.gridLine, { left: 0, top: top + i * cellH, width, height: 1 }]}
            />,
        );
    }
    if (band === 'floor') {
        lines.push(
            <View
                key="band-divider"
                style={[styles.bandDivider, { left: 0, top, width }]}
            />,
        );
    }
    return <React.Fragment key={`grid-${band}`}>{lines}</React.Fragment>;
}

const styles = StyleSheet.create({
    gridLine: {
        position: 'absolute',
        backgroundColor: 'rgba(46, 90, 62, 0.30)',
    },
    bandDivider: {
        position: 'absolute',
        height: 2,
        backgroundColor: 'rgba(46, 90, 62, 0.55)',
    },
    placedOverlay: {
        position: 'absolute',
        alignItems: 'stretch',
    },
    placedHighlight: {
        flex: 1,
        borderWidth: 2,
        borderColor: 'rgba(255, 215, 0, 0.7)',
        borderRadius: 4,
        backgroundColor: 'rgba(255, 215, 0, 0.08)',
    },
    ghost: {
        position: 'absolute',
        left: 0,
        top: 0,
        opacity: 0.85,
    },
    trashZone: {
        position: 'absolute',
        backgroundColor: 'rgba(120, 30, 30, 0.75)',
        borderWidth: 2,
        borderColor: '#E8B5B5',
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 8,
        elevation: 8,
    },
    trashZoneHover: {
        backgroundColor: 'rgba(190, 40, 40, 0.95)',
        borderColor: '#FFFFFF',
    },
    trashLabel: {
        color: '#E8B5B5',
        fontFamily: 'Monaco',
        fontSize: 10,
        textAlign: 'center',
    },
    trashLabelHover: {
        color: '#FFFFFF',
    },
    ghostImage: {
        width: '100%',
        height: '100%',
    },
    editButton: {
        position: 'absolute',
        right: 8,
        backgroundColor: 'rgba(46, 90, 62, 0.9)',
        borderWidth: 2,
        borderColor: '#E8F5E8',
        borderRadius: 6,
        paddingHorizontal: 12,
        paddingVertical: 8,
        zIndex: 10,
        elevation: 10,
    },
    editButtonActive: {
        backgroundColor: 'rgba(168, 93, 0, 0.95)',
    },
    editButtonText: {
        color: '#E8F5E8',
        fontFamily: 'Monaco',
        fontSize: 14,
    },
    paletteWrap: {
        position: 'absolute',
        left: 8,
        right: 8,
        zIndex: 9,
        elevation: 9,
    },
    paletteContent: {
        flexDirection: 'row',
        flexWrap: 'nowrap',
        paddingHorizontal: 6,
        paddingVertical: 6,
        backgroundColor: 'rgba(0, 0, 0, 0.55)',
        borderWidth: 2,
        borderColor: '#2E5A3E',
        borderRadius: 8,
        justifyContent: 'space-around',
    },
    paletteItem: {
        width: 56,
        height: 64,
        marginHorizontal: 2,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderWidth: 2,
        borderColor: 'transparent',
        borderRadius: 6,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 4,
    },
    paletteImage: {
        width: 36,
        height: 36,
    },
    paletteLabel: {
        color: '#E8F5E8',
        fontFamily: 'Monaco',
        fontSize: 10,
        marginTop: 2,
    },
});

export { WALL_GRID, FLOOR_GRID };
export default RoomEditor;
