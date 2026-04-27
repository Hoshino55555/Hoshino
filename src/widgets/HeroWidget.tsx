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
import { WidgetSnapshot } from './types';
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
    const empty = snapshot.characterId === null;

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

            {!empty && (
                <FlexWidget
                    style={{
                        width: 'match_parent',
                        height: 'match_parent',
                        justifyContent: 'center',
                        alignItems: 'center',
                    }}
                >
                    <ImageWidget
                        image={resolveAvatar(snapshot.avatarKey)}
                        imageHeight={320}
                        imageWidth={320}
                    />
                </FlexWidget>
            )}

            {!empty && (
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
                            value={snapshot.mood}
                            color={STAT_COLORS.mood}
                            starSize={20}
                            labelSize={11}
                        />
                        <StatStars
                            label="HNGR"
                            value={snapshot.hunger}
                            color={STAT_COLORS.hunger}
                            starSize={20}
                            labelSize={11}
                        />
                        <StatStars
                            label="ENGY"
                            value={snapshot.energy}
                            color={STAT_COLORS.energy}
                            starSize={20}
                            labelSize={11}
                        />
                    </FlexWidget>
                    {snapshot.foragedCount > 0 && (
                        <ForageBadge
                            count={snapshot.foragedCount}
                            characterId={snapshot.characterId}
                        />
                    )}
                </FlexWidget>
            )}

            {empty && (
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
