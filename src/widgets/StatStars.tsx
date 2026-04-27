'use no memo';
// React 19's compiler memoizes components, but `react-native-android-widget`
// invokes widget components as raw functions when building the remote views
// tree. Disabling the compiler for this file keeps that contract intact.
import React from 'react';
import { FlexWidget, ImageWidget, TextWidget } from 'react-native-android-widget';
import { FONT_PIXEL, STAR_FILLED, STAR_EMPTY } from './assets';

interface Props {
    label: string;
    value: number;
    color: string;
    starSize?: number;
    labelSize?: number;
    showLabel?: boolean;
    // Fewer steps means each star covers more of the stat range. 5 is the
    // default — gives a familiar five-star feel.
    steps?: number;
}

const StatStars: React.FC<Props> = ({
    label,
    value,
    color,
    starSize = 14,
    labelSize = 8,
    showLabel = true,
    steps = 5,
}) => {
    const clamped = Math.max(0, Math.min(100, value));
    const filled = Math.round((clamped / 100) * steps);

    const stars = [];
    for (let i = 0; i < steps; i++) {
        stars.push(
            <ImageWidget
                key={i}
                image={i < filled ? STAR_FILLED : STAR_EMPTY}
                imageWidth={starSize}
                imageHeight={starSize}
            />,
        );
    }

    return (
        <FlexWidget
            style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginBottom: 3,
            }}
        >
            {showLabel && (
                <TextWidget
                    text={label}
                    style={{
                        fontSize: labelSize,
                        color,
                        fontFamily: FONT_PIXEL,
                        marginRight: 5,
                    }}
                />
            )}
            {stars}
        </FlexWidget>
    );
};

export default StatStars;
