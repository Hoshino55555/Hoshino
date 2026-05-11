import React, { useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    Image,
    ScrollView,
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
} from '../../services/RoomLayout';
import { Frames } from '../../assets';
import { colors } from '../../styles/tokens';

interface PaletteEntry {
    asset: RoomItemAssetKey;
    label: string;
    band: RoomBand;
    span: { w: number; h: number };
}

const PALETTE: PaletteEntry[] = [
    { asset: 'decals.poster1', label: 'Poster A', band: 'wall', span: { w: 2, h: 2 } },
    { asset: 'decals.poster2', label: 'Poster B', band: 'wall', span: { w: 2, h: 2 } },
    { asset: 'decals.window', label: 'Window', band: 'wall', span: { w: 1, h: 2 } },
    { asset: 'floor.carpet', label: 'Carpet', band: 'floor', span: { w: 4, h: 4 } },
    { asset: 'floor.bed', label: 'Bed', band: 'floor', span: { w: 3, h: 4 } },
    { asset: 'floor.desk', label: 'Desk', band: 'floor', span: { w: 3, h: 3 } },
    { asset: 'floor.plant', label: 'Plant', band: 'floor', span: { w: 1, h: 2 } },
    { asset: 'minis.aro', label: 'Aro', band: 'floor', span: { w: 2, h: 3 } },
];

interface RoomEditorProps {
    layout: RoomLayout;
    onChange: (next: RoomLayout) => void;
    onDragItemChange?: (id: string | null) => void;
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

interface DropPreview {
    band: RoomBand;
    gx: number;
    gy: number;
    span: { w: number; h: number };
    valid: boolean;
}

let nextItemSerial = 1;
const newItemId = (asset: RoomItemAssetKey) =>
    `${asset}-${Date.now().toString(36)}-${nextItemSerial++}`;

const MIN_PLACED_TOUCH_SIZE = 48;
const PALETTE_DRAG_THRESHOLD = 6;

function sameDropPreview(a: DropPreview | null, b: DropPreview | null) {
    if (!a || !b) return a === b;
    return (
        a.band === b.band &&
        a.gx === b.gx &&
        a.gy === b.gy &&
        a.span.w === b.span.w &&
        a.span.h === b.span.h &&
        a.valid === b.valid
    );
}

const RoomEditor: React.FC<RoomEditorProps> = ({
    layout,
    onChange,
    onDragItemChange,
    bottomInset = 0,
}) => {
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
    const [dropPreview, setDropPreview] = useState<DropPreview | null>(null);

    const containerRef = useRef<View>(null);
    const containerOriginRef = useRef({ x: 0, y: 0 });
    const layoutRef = useRef(layout);
    const onChangeRef = useRef(onChange);
    const onDragItemChangeRef = useRef(onDragItemChange);
    // Source-of-truth for the active drag, accessed inside gesture
    // callbacks where setState is async/stale.
    const dragRef = useRef<{ source: DragSource; meta: DragMeta } | null>(null);
    const ghostPos = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

    layoutRef.current = layout;
    onChangeRef.current = onChange;
    onDragItemChangeRef.current = onDragItemChange;

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
    const editButtonBottom = bottomInset + size.h * 0.01;

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

    const previewFor = (
        source: DragSource,
        pageX: number,
        pageY: number,
    ): DropPreview | null => {
        const span = source.kind === 'palette' ? source.span : source.item.span ?? { w: 1, h: 1 };
        const drop = dropTargetFor(pageX, pageY, span);
        if (!drop) return null;
        const allowedBand = source.kind === 'palette' ? source.band : source.item.band;
        return {
            ...drop,
            span,
            valid: drop.band === allowedBand,
        };
    };

    const updateDropPreview = (next: DropPreview | null) => {
        setDropPreview((prev) => (sameDropPreview(prev, next) ? prev : next));
    };

    const clearDragState = () => {
        setDraggedId(null);
        setDragMeta(null);
        setTrashHover(false);
        updateDropPreview(null);
        onDragItemChangeRef.current?.(null);
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
        if (source.kind === 'placed') {
            setDraggedId(source.item.id);
            onDragItemChangeRef.current?.(source.item.id);
        } else {
            onDragItemChangeRef.current?.(null);
        }
        setDragMeta(meta);
        updateDropPreview(previewFor(source, pageX, pageY));
    };

    const updateDrag = (_e: GestureResponderEvent, g: PanResponderGestureState) => {
        const cur = dragRef.current;
        if (!cur) return;
        const pageX = g.moveX || g.x0;
        const pageY = g.moveY || g.y0;
        ghostPos.setValue({
            x: pageX - containerOriginRef.current.x - cur.meta.width / 2,
            y: pageY - containerOriginRef.current.y - cur.meta.height / 2,
        });
        if (cur.source.kind === 'placed') {
            const overTrash = isOverTrash(pageX, pageY);
            setTrashHover(overTrash);
            if (overTrash) {
                updateDropPreview(null);
                return;
            }
        }
        updateDropPreview(previewFor(cur.source, pageX, pageY));
    };

    const endDrag = (_e: GestureResponderEvent, g: PanResponderGestureState) => {
        const cur = dragRef.current;
        dragRef.current = null;
        if (!cur) {
            clearDragState();
            return;
        }
        const { source } = cur;
        const span = source.kind === 'palette' ? source.span : source.item.span ?? { w: 1, h: 1 };
        const currentLayout = layoutRef.current;
        // gestureState.moveX is 0 if no move occurred — fall back to the
        // grant point so a tap-and-release on a palette item lands at the
        // touch location instead of (0,0).
        const dropX = g.moveX || g.x0;
        const dropY = g.moveY || g.y0;

        if (source.kind === 'palette') {
            const drop = dropTargetFor(dropX, dropY, span);
            if (drop && drop.band === source.band) {
                onChangeRef.current([
                    ...currentLayout,
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
            clearDragState();
            return;
        }

        // Placed item — trash beats grid, so check trash first.
        if (isOverTrash(dropX, dropY)) {
            onChangeRef.current(currentLayout.filter((it) => it.id !== source.item.id));
            clearDragState();
            return;
        }
        const drop = dropTargetFor(dropX, dropY, span);
        // Outside grid or wrong band → leave in place (no layout change).
        if (!drop || drop.band !== source.item.band) {
            clearDragState();
            return;
        }
        // Same band, valid cell → reposition in place (preserve id/order).
        onChangeRef.current(
            currentLayout.map((it) =>
                it.id === source.item.id ? { ...it, gx: drop.gx, gy: drop.gy } : it,
            ),
        );
        clearDragState();
    };

    // One responder factory per role. `useMemo` keys off `editing`/size so the
    // closure sees current dimensions; mid-gesture we never re-run because
    // those don't change while a finger is down.
    const paletteResponders = useMemo(
        () =>
            PALETTE.map((entry) =>
                PanResponder.create({
                    onStartShouldSetPanResponder: () => false,
                    onMoveShouldSetPanResponder: (_e, g) =>
                        editing &&
                        size.w > 0 &&
                        Math.abs(g.dy) > PALETTE_DRAG_THRESHOLD &&
                        Math.abs(g.dy) >= Math.abs(g.dx),
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

            {editing &&
                size.w > 0 &&
                dropPreview &&
                renderDropPreview(dropPreview, size.w, wallHeight, floorHeight)}

            {editing && size.w > 0 &&
                sortedItems.map((item) => {
                    const bandTop = item.band === 'wall' ? 0 : wallHeight;
                    const bandH = item.band === 'wall' ? wallHeight : floorHeight;
                    const rect = itemPixelRect(item, size.w, bandH);
                    const itemLeft = rect.left;
                    const itemTop = rect.top + bandTop;
                    const extraW = Math.max(0, MIN_PLACED_TOUCH_SIZE - rect.width) / 2;
                    const extraH = Math.max(0, MIN_PLACED_TOUCH_SIZE - rect.height) / 2;
                    const hitLeft = Math.max(0, itemLeft - extraW);
                    const hitTop = Math.max(0, itemTop - extraH);
                    const hitRight = Math.min(size.w, itemLeft + rect.width + extraW);
                    const hitBottom = Math.min(size.h, itemTop + rect.height + extraH);
                    const responder = makePlacedResponder(item);
                    const isDragged = draggedId === item.id;
                    return (
                        <View
                            key={item.id}
                            {...responder.panHandlers}
                            style={[
                                styles.placedOverlay,
                                {
                                    left: hitLeft,
                                    top: hitTop,
                                    width: hitRight - hitLeft,
                                    height: hitBottom - hitTop,
                                    opacity: isDragged ? 0 : 1,
                                },
                            ]}
                        >
                            <View
                                style={[
                                    styles.placedHighlight,
                                    {
                                        left: itemLeft - hitLeft,
                                        top: itemTop - hitTop,
                                        width: rect.width,
                                        height: rect.height,
                                    },
                                ]}
                            />
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
                    style={[styles.paletteWrap, { bottom: bottomInset + 76 }]}
                >
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        scrollEnabled={!dragMeta}
                        style={styles.paletteFrame}
                        contentContainerStyle={styles.paletteContent}
                    >
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
                    </ScrollView>
                </View>
            )}

            <TouchableOpacity
                onPress={() => setEditing((prev) => !prev)}
                style={[styles.editButton, { bottom: editButtonBottom }]}
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
            >
                <Image
                    source={Frames.editButton}
                    style={styles.editButtonImage}
                    resizeMode="contain"
                />
                {editing && <View style={styles.editButtonActiveTint} pointerEvents="none" />}
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

function renderDropPreview(
    preview: DropPreview,
    width: number,
    wallHeight: number,
    floorHeight: number,
) {
    const bandTop = preview.band === 'wall' ? 0 : wallHeight;
    const bandHeight = preview.band === 'wall' ? wallHeight : floorHeight;
    const rect = itemPixelRect(
        {
            band: preview.band,
            gx: preview.gx,
            gy: preview.gy,
            span: preview.span,
        },
        width,
        bandHeight,
    );
    return (
        <View
            pointerEvents="none"
            style={[
                styles.dropPreview,
                {
                    left: rect.left,
                    top: rect.top + bandTop,
                    width: rect.width,
                    height: rect.height,
                },
                preview.valid ? styles.dropPreviewValid : styles.dropPreviewInvalid,
            ]}
        />
    );
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
        zIndex: 6,
        elevation: 6,
    },
    placedHighlight: {
        position: 'absolute',
        borderWidth: 2,
        borderColor: 'rgba(255, 215, 0, 0.7)',
        borderRadius: 4,
        backgroundColor: 'rgba(255, 215, 0, 0.08)',
    },
    dropPreview: {
        position: 'absolute',
        borderWidth: 2,
        borderRadius: 5,
        zIndex: 5,
        elevation: 5,
    },
    dropPreviewValid: {
        borderColor: 'rgba(120, 255, 170, 0.95)',
        backgroundColor: 'rgba(120, 255, 170, 0.16)',
    },
    dropPreviewInvalid: {
        borderColor: 'rgba(255, 100, 100, 0.95)',
        backgroundColor: 'rgba(255, 100, 100, 0.14)',
    },
    ghost: {
        position: 'absolute',
        left: 0,
        top: 0,
        opacity: 0.85,
        zIndex: 14,
        elevation: 14,
    },
    trashZone: {
        position: 'absolute',
        backgroundColor: 'rgba(120, 30, 30, 0.75)',
        borderWidth: 2,
        borderColor: '#E8B5B5',
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 15,
        elevation: 15,
    },
    trashZoneHover: {
        backgroundColor: 'rgba(190, 40, 40, 0.95)',
        borderColor: colors.white,
    },
    trashLabel: {
        color: '#E8B5B5',
        fontFamily: 'Monaco',
        fontSize: 15,
        textAlign: 'center',
    },
    trashLabelHover: {
        color: colors.white,
    },
    ghostImage: {
        width: '100%',
        height: '100%',
    },
    editButton: {
        position: 'absolute',
        right: 8,
        zIndex: 10,
        elevation: 10,
        padding: 4,
    },
    editButtonImage: {
        width: 60,
        height: 65,
    },
    editButtonActiveTint: {
        position: 'absolute',
        top: 4,
        left: 4,
        right: 4,
        bottom: 4,
        backgroundColor: 'rgba(168, 93, 0, 0.45)',
        borderRadius: 8,
    },
    paletteWrap: {
        position: 'absolute',
        left: 8,
        right: 8,
        zIndex: 11,
        elevation: 11,
    },
    paletteFrame: {
        backgroundColor: 'rgba(0, 0, 0, 0.55)',
        borderWidth: 2,
        borderColor: colors.forestDark,
        borderRadius: 8,
    },
    paletteContent: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 6,
        paddingVertical: 6,
        gap: 5,
    },
    paletteItem: {
        width: 54,
        height: 58,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderWidth: 2,
        borderColor: 'transparent',
        borderRadius: 6,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 4,
    },
    paletteImage: {
        width: 34,
        height: 34,
    },
    paletteLabel: {
        color: colors.mintPale,
        fontFamily: 'Monaco',
        fontSize: 9,
        lineHeight: 10,
        marginTop: 2,
        textAlign: 'center',
    },
});

export { WALL_GRID, FLOOR_GRID };
export default RoomEditor;
