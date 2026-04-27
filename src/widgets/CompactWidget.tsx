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
                image={WIDGET_BG_COMPACT}
                imageWidth={300}
                imageHeight={400}
                radius={14}
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
                        imageHeight={170}
                        imageWidth={170}
                    />
                </FlexWidget>
            )}

            {!empty && (
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
                            value={snapshot.mood}
                            color={STAT_COLORS.mood}
                            starSize={14}
                            labelSize={9}
                        />
                        <StatStars
                            label="H"
                            value={snapshot.hunger}
                            color={STAT_COLORS.hunger}
                            starSize={14}
                            labelSize={9}
                        />
                        <StatStars
                            label="E"
                            value={snapshot.energy}
                            color={STAT_COLORS.energy}
                            starSize={14}
                            labelSize={9}
                        />
                    </FlexWidget>
                    {snapshot.foragedCount > 0 && (
                        <ForageBadge
                            count={snapshot.foragedCount}
                            compact
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
