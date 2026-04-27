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
    WIDGET_BG_HERO,
    FONT_PIXEL,
    STAT_COLORS,
} from './assets';

interface Props {
    snapshot: WidgetSnapshot;
}

// Hero 4x4 — large avatar centered on the starfield, stat stars
// bottom-left, forage badge bottom-right.
const HeroWidget: React.FC<Props> = ({ snapshot }) => {
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
                image={WIDGET_BG_HERO}
                imageWidth={600}
                imageHeight={800}
                radius={16}
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
                        imageHeight={320}
                        imageWidth={320}
                    />
                </FlexWidget>
            )}

            {filled && (
                <FlexWidget
                    style={{
                        width: 'match_parent',
                        height: 'match_parent',
                        padding: 22,
                        flexDirection: 'row',
                        alignItems: 'flex-end',
                        justifyContent: 'space-between',
                    }}
                >
                    <FlexWidget style={{ flexDirection: 'column' }}>
                        <StatStars
                            label="MOOD"
                            value={filled.mood}
                            color={STAT_COLORS.mood}
                            starSize={20}
                            labelSize={11}
                        />
                        <StatStars
                            label="HNGR"
                            value={filled.hunger}
                            color={STAT_COLORS.hunger}
                            starSize={20}
                            labelSize={11}
                        />
                        <StatStars
                            label="ENGY"
                            value={filled.energy}
                            color={STAT_COLORS.energy}
                            starSize={20}
                            labelSize={11}
                        />
                    </FlexWidget>
                    {filled.foragedCount > 0 && (
                        <ForageBadge
                            count={filled.foragedCount}
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
                        padding: 14,
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                    }}
                >
                    <TextWidget
                        text="TAP TO BEGIN"
                        style={{
                            fontSize: 12,
                            color: '#b8c6ff',
                            fontFamily: FONT_PIXEL,
                        }}
                    />
                </FlexWidget>
            )}
        </OverlapWidget>
    );
};

export default HeroWidget;
