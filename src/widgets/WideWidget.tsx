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
    WIDGET_BG_WIDE,
    FONT_PIXEL,
    STAT_COLORS,
} from './assets';

interface Props {
    snapshot: WidgetSnapshot;
}

// Wide 4x2 — landscape canvas. Avatar fills the left half centered, stat
// stars stack on the right, forage badge tucked far right.
const WideWidget: React.FC<Props> = ({ snapshot }) => {
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
                image={WIDGET_BG_WIDE}
                imageWidth={800}
                imageHeight={400}
                radius={14}
                style={{ width: 'match_parent', height: 'match_parent' }}
            />

            <FlexWidget
                style={{
                    width: 'match_parent',
                    height: 'match_parent',
                    padding: 14,
                    flexDirection: 'row',
                    alignItems: 'center',
                }}
            >
                {filled && (
                    <ImageWidget
                        image={resolveAvatar(filled.avatarKey)}
                        imageHeight={170}
                        imageWidth={170}
                    />
                )}

                <FlexWidget
                    style={{
                        flex: 1,
                        marginLeft: 10,
                        flexDirection: 'column',
                        justifyContent: 'center',
                    }}
                >
                    {!filled && (
                        <TextWidget
                            text="TAP TO BEGIN"
                            style={{
                                fontSize: 10,
                                color: '#b8c6ff',
                                fontFamily: FONT_PIXEL,
                            }}
                        />
                    )}

                    {filled && (
                        <FlexWidget style={{ flexDirection: 'column' }}>
                            <StatStars
                                label="MOOD"
                                value={filled.mood}
                                color={STAT_COLORS.mood}
                                starSize={16}
                                labelSize={10}
                            />
                            <StatStars
                                label="HNGR"
                                value={filled.hunger}
                                color={STAT_COLORS.hunger}
                                starSize={16}
                                labelSize={10}
                            />
                            <StatStars
                                label="ENGY"
                                value={filled.energy}
                                color={STAT_COLORS.energy}
                                starSize={16}
                                labelSize={10}
                            />
                        </FlexWidget>
                    )}
                </FlexWidget>

                {filled && filled.foragedCount > 0 && (
                    <FlexWidget style={{ marginLeft: 6 }}>
                        <ForageBadge
                            count={filled.foragedCount}
                            compact
                            characterId={filled.characterId}
                        />
                    </FlexWidget>
                )}
            </FlexWidget>
        </OverlapWidget>
    );
};

export default WideWidget;
