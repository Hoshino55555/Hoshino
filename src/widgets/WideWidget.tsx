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
                {!empty && (
                    <ImageWidget
                        image={resolveAvatar(snapshot.avatarKey)}
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
                    {empty && (
                        <TextWidget
                            text="TAP TO BEGIN"
                            style={{
                                fontSize: 10,
                                color: '#b8c6ff',
                                fontFamily: FONT_PIXEL,
                            }}
                        />
                    )}

                    {!empty && (
                        <FlexWidget style={{ flexDirection: 'column' }}>
                            <StatStars
                                label="MOOD"
                                value={snapshot.mood}
                                color={STAT_COLORS.mood}
                                starSize={16}
                                labelSize={10}
                            />
                            <StatStars
                                label="HNGR"
                                value={snapshot.hunger}
                                color={STAT_COLORS.hunger}
                                starSize={16}
                                labelSize={10}
                            />
                            <StatStars
                                label="ENGY"
                                value={snapshot.energy}
                                color={STAT_COLORS.energy}
                                starSize={16}
                                labelSize={10}
                            />
                        </FlexWidget>
                    )}
                </FlexWidget>

                {!empty && snapshot.foragedCount > 0 && (
                    <FlexWidget style={{ marginLeft: 6 }}>
                        <ForageBadge
                            count={snapshot.foragedCount}
                            compact
                            characterId={snapshot.characterId}
                        />
                    </FlexWidget>
                )}
            </FlexWidget>
        </OverlapWidget>
    );
};

export default WideWidget;
