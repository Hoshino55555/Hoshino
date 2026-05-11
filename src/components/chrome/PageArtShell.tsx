import React, { type ReactNode } from 'react';
import {
    Image,
    ImageBackground,
    StyleSheet,
    View,
    type ImageResizeMode,
    type ImageSourcePropType,
    type ImageStyle,
    type StyleProp,
    type ViewStyle,
} from 'react-native';

interface PageArtOverlay {
    source: ImageSourcePropType;
    edge: 'top' | 'bottom';
    height: number;
    key?: string;
    resizeMode?: ImageResizeMode;
    style?: StyleProp<ViewStyle>;
    imageStyle?: StyleProp<ImageStyle>;
    zIndex?: number;
}

interface PageArtShellProps {
    background: ImageSourcePropType;
    children: ReactNode;
    overlays?: PageArtOverlay[];
    testID?: string;
    backgroundColor?: string;
    backgroundResizeMode?: ImageResizeMode;
    style?: StyleProp<ViewStyle>;
}

const PageArtShell: React.FC<PageArtShellProps> = ({
    background,
    children,
    overlays = [],
    testID,
    backgroundColor,
    backgroundResizeMode = 'cover',
    style,
}) => (
    <View style={[styles.root, backgroundColor ? { backgroundColor } : null, style]}>
        <ImageBackground
            source={background}
            style={styles.background}
            resizeMode={backgroundResizeMode}
            testID={testID}
        >
            {children}
            {overlays.map((overlay, index) => (
                <View
                    key={overlay.key ?? `${overlay.edge}-${index}`}
                    pointerEvents="none"
                    style={[
                        styles.overlay,
                        overlay.edge === 'top' ? styles.topOverlay : styles.bottomOverlay,
                        {
                            height: overlay.height,
                            zIndex: overlay.zIndex ?? 1,
                        },
                        overlay.style,
                    ]}
                >
                    <Image
                        source={overlay.source}
                        style={[styles.overlayImage, overlay.imageStyle]}
                        resizeMode={overlay.resizeMode ?? 'contain'}
                    />
                </View>
            ))}
        </ImageBackground>
    </View>
);

const styles = StyleSheet.create({
    root: {
        flex: 1,
    },
    background: {
        flex: 1,
        width: '100%',
        height: '100%',
    },
    overlay: {
        position: 'absolute',
        left: 0,
        right: 0,
    },
    topOverlay: {
        top: 0,
    },
    bottomOverlay: {
        bottom: 0,
    },
    overlayImage: {
        width: '100%',
        height: '100%',
    },
});

export type { PageArtOverlay };
export default PageArtShell;
