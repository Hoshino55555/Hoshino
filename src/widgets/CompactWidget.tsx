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
import StatStars from './StatStars';
import ForageBadge from './ForageBadge';
import { WidgetSnapshot, isFilledSnapshot } from './types';
import {
    resolveAvatar,
    WIDGET_BG_COMPACT,
    FONT_PIXEL,
    STAT_COLORS,
} from './assets';

interface Props {
    snapshot: WidgetSnapshot;
}

// Compact 2x2 — avatar floats centered on the starfield, stat stars and
// forage badge overlay along the bottom edge.
const CompactWidget: React.FC<Props> = ({ snapshot }) => {
    // Type predicate gives us a narrowed `filled: WidgetMoonokoSnapshot | null`
    // — see types.ts for why we route through a predicate instead of a plain
    // discriminator check.
    const filled = isFilledSnapshot(snapshot) ? snapshot : null;

    return (
        <OverlapWidget
            clickAction="OPEN_APP"
            style={{
                width: 'match_parent',
                height: 'match_parent',
            }}
        >
            <ImageWidget
                image={WIDGET_BG_COMPACT}
                imageWidth={300}
                imageHeight={400}
                radius={14}
                style={{ width: 'match_parent', height: 'match_parent' }}
            />

            {filled && (
                <FlexWidget
                    style={{
                        width: 'match_parent',
                        height: 'match_parent',
                        justifyContent: 'center',
                        alignItems: 'center',
                    }}
                >
                    <ImageWidget
                        image={resolveAvatar(filled.avatarKey)}
                        imageHeight={170}
                        imageWidth={170}
                    />
                </FlexWidget>
            )}

            {filled && (
                <FlexWidget
                    style={{
                        width: 'match_parent',
                        height: 'match_parent',
                        padding: 14,
                        flexDirection: 'row',
                        alignItems: 'flex-end',
                        justifyContent: 'space-between',
                    }}
                >
                    <FlexWidget style={{ flexDirection: 'column' }}>
                        <StatStars
                            label="M"
                            value={filled.mood}
                            color={STAT_COLORS.mood}
                            starSize={14}
                            labelSize={9}
                        />
                        <StatStars
                            label="H"
                            value={filled.hunger}
                            color={STAT_COLORS.hunger}
                            starSize={14}
                            labelSize={9}
                        />
                        <StatStars
                            label="E"
                            value={filled.energy}
                            color={STAT_COLORS.energy}
                            starSize={14}
                            labelSize={9}
                        />
                    </FlexWidget>
                    {filled.foragedCount > 0 && (
                        <ForageBadge
                            count={filled.foragedCount}
                            compact
                            characterId={filled.characterId}
                        />
                    )}
                </FlexWidget>
            )}

            {!filled && (
                <FlexWidget
                    style={{
                        width: 'match_parent',
                        height: 'match_parent',
                        padding: 10,
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                    }}
                >
                    <TextWidget
                        text="TAP TO START"
                        style={{
                            fontSize: 9,
                            color: '#b8c6ff',
                            fontFamily: FONT_PIXEL,
                        }}
                    />
                </FlexWidget>
            )}
        </OverlapWidget>
    );
};

export default CompactWidget;
