'use no memo';
// React 19's compiler memoizes components, but `react-native-android-widget`
// invokes widget components as raw functions when building the remote views
// tree. Disabling the compiler for this file keeps that contract intact.
import React from 'react';
import {
    FlexWidget,
    ImageWidget,
    OverlapWidget,
    TextWidget,
} from 'react-native-android-widget';
import { FONT_PIXEL, FORAGE_SPRITES } from './assets';

interface Props {
    count: number;
    // Compact shrinks every dimension so the pile fits next to a 2x2 stat
    // column. The non-compact variant is for Hero where there's room.
    compact?: boolean;
    // Pinned to the character whose snapshot drove this render. Embedded in
    // the deep-link URI so App can refuse to drain if the active character
    // has changed since the widget last refreshed (stale tap).
    characterId: string;
}

// Triangle-pile arrangement: each successive find adds another sprite to the
// pile. Slots fill bottom-to-top, then bottom row outward, so the silhouette
// grows like a real heap. (x, y) are dp offsets from the pile's top-left.
const SLOTS_BY_ROW = [
    // bottom row — three sprites side by side
    [
        { x: 0, y: 28 },
        { x: 18, y: 28 },
        { x: 36, y: 28 },
    ],
    // middle row — two sprites, offset to nestle between bottom row
    [
        { x: 9, y: 14 },
        { x: 27, y: 14 },
    ],
    // top row — one sprite, capping the triangle
    [{ x: 18, y: 0 }],
];
const PILE_FILL_ORDER = [
    SLOTS_BY_ROW[0][1], // 1: center bottom
    SLOTS_BY_ROW[0][0], // 2: bottom-left
    SLOTS_BY_ROW[0][2], // 3: bottom-right
    SLOTS_BY_ROW[1][0], // 4: middle-left
    SLOTS_BY_ROW[1][1], // 5: middle-right
    SLOTS_BY_ROW[2][0], // 6: top
];
const MAX_PILE = PILE_FILL_ORDER.length;

const ForageBadge: React.FC<Props> = ({ count, compact = false, characterId }) => {
    if (count <= 0) return null;
    const drainUri = `hoshino://forage/drain?characterId=${encodeURIComponent(characterId)}`;

    const visible = Math.min(count, MAX_PILE);
    const overflow = count - MAX_PILE;
    // Sprite size — compact tucks tighter, Hero gets a larger pile to read at
    // arm's length. The slot offsets above are tuned for ~24dp sprites; we
    // scale the layout box proportionally below so compact still nests.
    const sprite = compact ? 22 : 28;
    const scale = sprite / 24;
    // Bounding box covers all six slots: 36+sprite wide, 28+sprite tall.
    const boxW = Math.round((36 + 24) * scale);
    const boxH = Math.round((28 + 24) * scale);

    return (
        <FlexWidget
            clickAction="OPEN_URI"
            clickActionData={{ uri: drainUri }}
            style={{
                flexDirection: 'column',
                alignItems: 'center',
            }}
        >
            <OverlapWidget style={{ width: boxW, height: boxH }}>
                {PILE_FILL_ORDER.slice(0, visible).map((slot, i) => (
                    <FlexWidget
                        key={i}
                        style={{
                            width: 'wrap_content',
                            height: 'wrap_content',
                            marginLeft: Math.round(slot.x * scale),
                            marginTop: Math.round(slot.y * scale),
                        }}
                    >
                        <ImageWidget
                            image={FORAGE_SPRITES[i % FORAGE_SPRITES.length]}
                            imageWidth={sprite}
                            imageHeight={sprite}
                        />
                    </FlexWidget>
                ))}
            </OverlapWidget>
            {overflow > 0 && (
                <TextWidget
                    text={`+${overflow}`}
                    style={{
                        fontSize: compact ? 8 : 10,
                        color: '#FFD700',
                        fontFamily: FONT_PIXEL,
                        marginTop: 2,
                    }}
                />
            )}
        </FlexWidget>
    );
};

export default ForageBadge;
