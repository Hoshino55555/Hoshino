import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';

// Get screen dimensions for responsive sizing
const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const isTablet = screenWidth > 768; // Common tablet breakpoint

interface FrameProps {
    children: React.ReactNode;
    width?: string | number;
    height?: string | number;
    top?: string | number;
    left?: string | number;
    position?: 'absolute' | 'relative';
    showBackgroundImage?: boolean;
    backgroundImageSource?: any;
    pixelSize?: number;
    contentPadding?: number;
    scale?: number;
}

const Frame: React.FC<FrameProps> = ({
    children,
    width = isTablet ? '75%' : '78%',
    height = isTablet ? '65%' : '51%',
    top = isTablet ? '20%' : '22%',
    left = '50%',
    position = 'absolute',
    showBackgroundImage = true,
    backgroundImageSource,
    pixelSize: customPixelSize,

}) => {
    const resolveAxis = (value: string | number, axis: 'width' | 'height'): number => {
        if (typeof value === 'number') return value;
        if (typeof value === 'string' && value.includes('%')) {
            const percentage = parseFloat(value) / 100;
            return (axis === 'width' ? screenWidth : screenHeight) * percentage;
        }
        return parseFloat(value) || 0;
    };

    const frameWidth = resolveAxis(width, 'width');
    const frameHeight = resolveAxis(height, 'height');
    // Pixel coordinates are local to the outer container (origin 0,0).
    // The outer container's top/left style handles on-screen placement.
    const frameLeft = 0;
    const frameTop = 0;

    const pixelSize = customPixelSize || 4;
    const pixels: React.ReactNode[] = [];

    // Border configuration object with all the perfected calculations
    const borderConfig = {
        // Size multipliers
        outerEdge: 5,
        innerGlow: 2,
        bottomRight: 3,
        mirror: 4,
        extension: 6,
        glowExtension: 7,
        pixelSize,
        positionOffsetX: 0,
        positionOffsetY: 0,

        // Converted pixel values
        get outerEdgePx() { return this.outerEdge * this.pixelSize; },
        get innerGlowPx() { return this.innerGlow * this.pixelSize; },
        get bottomRightPx() { return this.bottomRight * this.pixelSize; },
        get mirrorPx() { return this.mirror * this.pixelSize; },
        get extensionPx() { return this.extension * this.pixelSize; },
        get glowExtensionPx() { return this.glowExtension * this.pixelSize; },

        // Base positions
        get outerBaseX() { return frameLeft + this.positionOffsetX - this.outerEdgePx; },
        get outerBaseY() { return frameTop + this.positionOffsetY - this.outerEdgePx; },
        get innerGlowBaseX() { return this.outerBaseX + this.innerGlowPx; },
        get innerGlowBaseY() { return this.outerBaseY + this.innerGlowPx; },
        get bottomRightBaseX() { return frameLeft + this.positionOffsetX + frameWidth + this.bottomRightPx; },
        get bottomRightBaseY() { return frameTop + this.positionOffsetY + frameHeight + this.bottomRightPx; },

        // Outer lines use 3-5 pattern
        get outerLineLeft() { return frameLeft + this.positionOffsetX - (this.pixelSize * 3); }, // 3 pixel lengths
        get outerLineTop() { return frameTop + this.positionOffsetY - this.outerEdgePx + (this.pixelSize * 0.25); }, // 6 pixel lengths (moved down 1)
        get outerLineWidth() { return frameWidth + this.extensionPx; },
        get outerLineHeight() { return frameHeight + this.extensionPx; },

        // Vertical line uses 5-3 pattern (swapped)
        get outerLineVerticalLeft() { return frameLeft + this.positionOffsetX - this.outerEdgePx; }, // 5 pixel lengths
        get outerLineVerticalTop() { return frameTop + this.positionOffsetY - (this.pixelSize * 3); }, // 3 pixel lengths

        // Glow lines use 2-4 pattern
        get glowLineLeft() { return frameLeft + this.positionOffsetX - (this.pixelSize * 2); }, // 2 pixel lengths
        get glowLineTop() { return frameTop + this.positionOffsetY - this.innerGlowPx - this.pixelSize; },
        get glowLineWidth() { return frameWidth + (this.pixelSize * 4); }, // 4 pixel lengths
        get glowLineHeight() { return frameHeight + (this.pixelSize * 4); }, // 4 pixel lengths

        // Glow lines vertical (swapped pattern)
        get glowLineVerticalLeft() { return frameLeft + this.positionOffsetX - this.innerGlowPx - this.pixelSize; }, // 2 pixel lengths
        get glowLineVerticalTop() { return frameTop + this.positionOffsetY - (this.pixelSize * 2); }, // 3 pixel lengths (moved up 1)
        get glowLineVerticalHeight() { return frameHeight + (this.pixelSize * 4); }, // 5 pixel lengths (was 4)

        // Inner lines use 1-2 pattern
        get innerLineLeft() { return frameLeft + this.positionOffsetX - this.innerGlowPx; }, // 2 pixel lengths (extended to meet outer glow verticals)
        get innerLineTop() { return frameTop + this.positionOffsetY - this.innerGlowPx; }, // 2 pixel lengths
        get innerLineWidth() { return frameWidth + (this.pixelSize * 4) - 0.5; }, // 4 pixel lengths (extended to meet outer glow verticals; -0.5 trims subpixel overhang on right)
        get innerLineHeight() { return frameHeight + (this.pixelSize * 2); }, // 2 pixel lengths

        // Inner lines vertical (swapped pattern)
        get innerLineVerticalLeft() { return frameLeft + this.positionOffsetX - this.innerGlowPx; }, // 2 pixel lengths
        get innerLineVerticalTop() { return frameTop + this.positionOffsetY - this.pixelSize; }, // 1 pixel length
        get innerLineVerticalHeight() { return frameHeight + (this.pixelSize * 2); }, // 2 pixel lengths

        // Inner glow lines use 1-1 pattern
        get topInnerGlowLeft() { return frameLeft + this.positionOffsetX - this.pixelSize; }, // 1 pixel length
        get topInnerGlowTop() { return frameTop + this.positionOffsetY - this.pixelSize; }, // 1 pixel length
        get topInnerGlowWidth() { return frameWidth + (this.pixelSize * 2); }, // 2 pixel lengths

        get leftInnerGlowLeft() { return frameLeft + this.positionOffsetX - this.pixelSize; }, // 1 pixel length
        get leftInnerGlowTop() { return frameTop + this.positionOffsetY; }, // 0 pixel lengths
        get leftInnerGlowHeight() { return frameHeight + this.pixelSize; }, // 1 pixel length
    };

    // Helper function for creating pixel elements
    const createPixel = (key: string, style: any, x: number, y: number, width = pixelSize, height = pixelSize) => {
        pixels.push(
            <View
                key={key}
                pointerEvents="none"
                style={[
                    style,
                    {
                        left: x,
                        top: y,
                        width,
                        height,
                    }
                ]}
            />
        );
    };

    // Helper function for calculating mirrored positions
    const calculateMirroredPosition = (relativeX: number, relativeY: number, mirrorX: boolean, mirrorY: boolean, baseScreenX: number, baseScreenY: number) => {
        let finalRelativeX = relativeX;
        let finalRelativeY = relativeY;
        let finalBaseX = baseScreenX;
        let finalBaseY = baseScreenY;

        // Calculate the offset from the base position
        const offsetX = baseScreenX - borderConfig.outerBaseX;
        const offsetY = baseScreenY - borderConfig.outerBaseY;

        if (mirrorX) {
            finalRelativeX = 4 - relativeX;
            finalBaseX = frameLeft + borderConfig.positionOffsetX + frameWidth - offsetX; // Apply inverse offset for mirrored
        }
        if (mirrorY) {
            finalRelativeY = 4 - relativeY;
            finalBaseY = frameTop + borderConfig.positionOffsetY + frameHeight - offsetY; // Apply inverse offset for mirrored
        }

        return {
            x: finalBaseX + (finalRelativeX * pixelSize),
            y: finalBaseY + (finalRelativeY * pixelSize)
        };
    };

    // Generate all 4 corners from 1 base corner using mirroring
    const baseCorner = { x: 1, y: 1 }; // single corner pixel
    const cornerPositions = [
        { mirrorX: false, mirrorY: false }, // top-left (original)
        { mirrorX: true, mirrorY: false },  // top-right
        { mirrorX: false, mirrorY: true },  // bottom-left
        { mirrorX: true, mirrorY: true },   // bottom-right
    ];

    cornerPositions.forEach((position, cornerIndex) => {
        // Calculate mirrored position using the helper function
        const { x, y } = calculateMirroredPosition(baseCorner.x, baseCorner.y, position.mirrorX, position.mirrorY, borderConfig.outerBaseX, borderConfig.outerBaseY);

        createPixel(`outer-corner-${cornerIndex}`, styles.outerPixel, x, y);
    });

    // Add inner glow corner pixels using same mirroring approach
    cornerPositions.forEach((position, cornerIndex) => {
        // Calculate mirrored position using the helper function
        const { x, y } = calculateMirroredPosition(baseCorner.x, baseCorner.y, position.mirrorX, position.mirrorY, borderConfig.innerGlowBaseX, borderConfig.innerGlowBaseY);

        createPixel(`inner-glow-corner-${cornerIndex}`, styles.glowPixel, x, y);
    });

    // Add bottom-right glow corner pixels manually (no loop needed)
    // Outer pixels (3 total) - mirrored for bottom-right
    //createPixel("glow-outer-1", styles.glowPixel, borderConfig.bottomRightBaseX + pixelSize, borderConfig.bottomRightBaseY);
    //createPixel("glow-outer-2", styles.glowPixel, borderConfig.bottomRightBaseX, borderConfig.bottomRightBaseY + pixelSize);
    //createPixel("glow-outer-3", styles.glowPixel, borderConfig.bottomRightBaseX + pixelSize, borderConfig.bottomRightBaseY + pixelSize);
    
    // Bottom line (glow - lighter green) - REMOVED
    // createPixel("bottom-glow-line", styles.glowPixel, borderConfig.outerLineLeft + pixelSize, frameTop + frameHeight + borderConfig.outerEdgePx, borderConfig.outerLineWidth - (pixelSize * 0.75), pixelSize);
    
    // Right line (glow - lighter green) - REMOVED
    // createPixel("right-glow-line", styles.glowPixel, frameLeft + frameWidth + borderConfig.outerEdgePx, borderConfig.outerLineTop + (pixelSize * 2.25), pixelSize, borderConfig.outerLineHeight);

    // Outer border lines using mirroring (dark green)
    // Define base outer lines that will be mirrored
    const baseOuterLines = [
        {
            type: 'horizontal',
            left: borderConfig.outerLineLeft,
            top: borderConfig.outerLineTop,
            width: borderConfig.outerLineWidth,
            height: pixelSize,
        },
        {
            type: 'vertical',
            left: borderConfig.outerLineVerticalLeft,
            top: borderConfig.outerLineVerticalTop,
            width: pixelSize,
            height: borderConfig.outerLineHeight,
        },
    ];

    // Generate all 4 outer border lines from 2 base lines
    baseOuterLines.forEach((line, lineIndex) => {
        // Create original outer line
        createPixel(`outer-line-${lineIndex}-original`, styles.outerPixel, line.left, line.top, line.width, line.height);

        // Create mirrored outer line
        const mirroredLeft = line.type === 'horizontal' ? line.left : frameLeft + frameWidth + borderConfig.mirrorPx;
        const mirroredTop = line.type === 'horizontal' ? frameTop + frameHeight + borderConfig.mirrorPx : line.top;
        createPixel(`outer-line-${lineIndex}-mirrored`, styles.outerPixel, mirroredLeft, mirroredTop, line.width, line.height);
    });

    // Outer glow border lines using mirroring (brighter green, shifted out and 2x longer)
    // Define base glow lines that will be mirrored
    const baseGlowLines = [
        {
            type: 'horizontal',
            left: borderConfig.glowLineLeft,
            top: borderConfig.glowLineTop,
            width: borderConfig.glowLineWidth,
            height: pixelSize,
        },
        {
            type: 'vertical',
            left: borderConfig.glowLineVerticalLeft,
            top: borderConfig.glowLineVerticalTop,
            width: pixelSize + 1,
            height: borderConfig.glowLineVerticalHeight,
        },
    ];

    // Generate all 4 glow border lines from 2 base lines
    baseGlowLines.forEach((line, lineIndex) => {
        // Create original glow line
        createPixel(`glow-line-${lineIndex}-original`, styles.glowPixel, line.left, line.top, line.width, line.height);

        // Create mirrored glow line
        const mirroredLeft = line.type === 'horizontal' ? line.left : frameLeft + frameWidth + borderConfig.pixelSize + pixelSize - 1;
        const mirroredTop = line.type === 'horizontal' ? frameTop + frameHeight + borderConfig.pixelSize + pixelSize : line.top;
        createPixel(`glow-line-${lineIndex}-mirrored`, styles.glowPixel, mirroredLeft, mirroredTop, line.width, line.height);
    });

    // Inner border lines using mirroring (darker green)
    // Define base inner lines that will be mirrored
    const baseInnerLines = [
        {
            type: 'horizontal',
            left: borderConfig.innerLineLeft,
            top: borderConfig.innerLineTop,
            width: borderConfig.innerLineWidth,
            height: pixelSize,
        },
        {
            type: 'vertical',
            left: borderConfig.innerLineVerticalLeft,
            top: borderConfig.innerLineVerticalTop,
            width: pixelSize,
            height: borderConfig.innerLineVerticalHeight,
        },
    ];

    // Generate all 4 inner border lines from 2 base lines
    baseInnerLines.forEach((line, lineIndex) => {
        // Create original inner line
        createPixel(`inner-line-${lineIndex}-original`, styles.innerPixel, line.left, line.top, line.width, line.height);

        // Create mirrored inner line
        const mirroredLeft = line.type === 'horizontal' ? line.left : frameLeft + frameWidth + borderConfig.pixelSize;
        const mirroredTop = line.type === 'horizontal' ? frameTop + frameHeight + borderConfig.pixelSize : line.top;
        createPixel(`inner-line-${lineIndex}-mirrored`, styles.innerPixel, mirroredLeft, mirroredTop, line.width, line.height);
    });

    // Inner glow lines (one pixel length inside inner dark lines)
    // Top inner glow line
    createPixel("top-inner-glow-line", styles.glowPixel, borderConfig.topInnerGlowLeft, borderConfig.topInnerGlowTop, borderConfig.topInnerGlowWidth, pixelSize);

    // Left inner glow line
    createPixel("left-inner-glow-line", styles.glowPixel, borderConfig.leftInnerGlowLeft, borderConfig.leftInnerGlowTop, pixelSize, borderConfig.leftInnerGlowHeight);

    return (
        <View
            pointerEvents="box-none"
            style={[
                styles.frameContainer,
                {
                    width: width as any,
                    height: height as any,
                    top: top as any,
                    left: left as any,
                    position,
                }
            ]}>
            {/* Pixelated borders */}
            {pixels}

            {/* Background image */}
            {showBackgroundImage && (
                <View style={styles.backgroundContainer}>
                    {/* Background would go here if needed */}
                </View>
            )}

            {/* Content area */}
            <View style={styles.contentArea}>
                {children}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    frameContainer: {
        overflow: 'visible',
        backgroundColor: 'transparent',
        pointerEvents: 'box-none',
    },
    backgroundContainer: {
        position: 'absolute',
        top: isTablet ? 16 : 12,
        left: isTablet ? 16 : 12,
        right: isTablet ? 16 : 12,
        bottom: isTablet ? 16 : 12,
        zIndex: 1,
        overflow: 'hidden',
    },
    contentArea: {
        position: 'absolute',
        top: isTablet ? 2 : 1,
        left: isTablet ? 4 : 3,
        right: isTablet ? 4 : 3,
        bottom: isTablet ? 4 : 3,
        zIndex: 2,
        justifyContent: 'flex-start',
        alignItems: 'center',
        pointerEvents: 'box-none',
    },
    outerPixel: {
        position: 'absolute',
        backgroundColor: '#2E5A3E', // Dark green
        zIndex: 10,
    },
    glowPixel: {
        position: 'absolute',
        backgroundColor: '#8FBF7A', // Yellowish green glow with more blue
        zIndex: 11,
    },
    innerPixel: {
        position: 'absolute',
        backgroundColor: '#2E5A3E', // Same dark green
        zIndex: 12,
    },
});

export default Frame;