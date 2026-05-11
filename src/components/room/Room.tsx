import React from 'react';
import { View, Image, StyleSheet, type LayoutChangeEvent } from 'react-native';
import {
    type RoomItem,
    type RoomLayout,
    STARTER_ROOM_LAYOUT,
    WALL_BAND_FRACTION,
    itemPixelRect,
    resolveRoomAsset,
} from '../../services/RoomLayout';
import { Rooms } from '../../assets';

interface Props {
    /** Layout to render. Defaults to the starter mockup until persistence + editor land. */
    layout?: RoomLayout;
    /** Temporarily hidden while the editor renders the drag ghost for this item. */
    hiddenItemId?: string | null;
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
const Room: React.FC<Props> = ({ layout = STARTER_ROOM_LAYOUT, hiddenItemId = null }) => {
    const [size, setSize] = React.useState<{ w: number; h: number } | null>(null);

    const onLayout = (e: LayoutChangeEvent) => {
        const { width, height } = e.nativeEvent.layout;
        if (!size || size.w !== width || size.h !== height) {
            setSize({ w: width, h: height });
        }
    };

    const wallHeight = size ? size.h * WALL_BAND_FRACTION : 0;
    const floorHeight = size ? size.h - wallHeight : 0;
    const bandWidth = size?.w ?? 0;

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

            {size && (
                <View style={[styles.bandLayer, { top: 0, height: wallHeight }]} pointerEvents="none">
                    {wallItems.map((it) => renderItem(it, bandWidth, wallHeight))}
                </View>
            )}

            {size && (
                <View
                    style={[styles.bandLayer, { top: wallHeight, height: floorHeight }]}
                    pointerEvents="none"
                >
                    {floorItems.map((it) => renderItem(it, bandWidth, floorHeight))}
                </View>
            )}
        </View>
    );
};

function renderItem(item: RoomItem, bandWidth: number, bandHeight: number) {
    const rect = itemPixelRect(item, bandWidth, bandHeight);
    return (
        <Image
            key={item.id}
            source={resolveRoomAsset(item.asset)}
            style={[styles.item, rect]}
            resizeMode="contain"
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
        left: 0,
        right: 0,
        overflow: 'hidden',
    },
    item: {
        position: 'absolute',
    },
});

export default Room;
