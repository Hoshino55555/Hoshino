import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useChromeConfig } from '../../contexts/ChromeContext';
import FooterBackBar from '../chrome/FooterBackBar';
import Room from './Room';
import RoomEditor from './RoomEditor';
import { type RoomLayout, STARTER_ROOM_LAYOUT } from '../../services/RoomLayout';
import { colors } from '../../styles/tokens';

// Single shared room for the local-only MVP. Switch to per-character keying
// (`room:layout:${characterId}`) when the editor moves to a per-moonoko home.
const ROOM_LAYOUT_STORAGE_KEY = 'room:layout:v7';

interface Props {
    onBack: () => void;
}

// "Gallery" is the legacy file/route name; the page itself is the Room — a
// decoratable space the user fills with cosmetics. Filename kept so all the
// menu/navigation wiring stays put; rename in a polish pass once locked in.
//
// Rendered fullscreen (not inside InnerScreen) because the room artwork is
// authored with its own portrait frame at the device aspect ratio. Fitting
// it into the in-cavity 88x65% window cropped the painted wall and stretched
// proportions; edge-to-edge lets the artwork breathe and matches the mockup.
const Gallery: React.FC<Props> = ({ onBack }) => {
    const insets = useSafeAreaInsets();
    const { height } = useWindowDimensions();
    // Lift the back+edit buttons off the very bottom edge so they don't
    // sit on top of the painted room frame.
    const roomChromeLift = height * 0.02;
    const footerInset = insets.bottom + height * 0.01 + roomChromeLift;
    const footerTopPadding = height * 0.005;
    // Editable room layout. Hydrate from AsyncStorage; fall back to the
    // hand-tuned starter mockup so first-time users see a furnished room.
    // `hydrated` gates the persistence effect — saving the placeholder layout
    // before the load resolves would clobber a real saved room.
    const [layout, setLayout] = useState<RoomLayout>(STARTER_ROOM_LAYOUT);
    const [draggedRoomItemId, setDraggedRoomItemId] = useState<string | null>(null);
    // Edit-mode state lives here (not in RoomEditor) so <Room> can paint its
    // grid behind the items when the editor is open.
    const [editing, setEditing] = useState(false);
    const hydratedRef = useRef(false);

    useEffect(() => {
        AsyncStorage.getItem(ROOM_LAYOUT_STORAGE_KEY)
            .then((raw) => {
                if (raw) {
                    try {
                        const parsed = JSON.parse(raw);
                        if (Array.isArray(parsed)) setLayout(parsed);
                    } catch {
                        // Corrupt JSON falls through to STARTER_ROOM_LAYOUT.
                    }
                }
            })
            .finally(() => {
                hydratedRef.current = true;
            });
    }, []);

    useEffect(() => {
        if (!hydratedRef.current) return;
        AsyncStorage.setItem(ROOM_LAYOUT_STORAGE_KEY, JSON.stringify(layout)).catch((e) =>
            console.warn('room layout save failed', e),
        );
    }, [layout]);

    const handleClose = () => {
        onBack();
    };

    // Standard back affordance for expanded views: the chrome's left
    // device button (the physical-looking one painted on the casing) wired
    // to close, no visible in-screen label. Matches Shop/Settings/Collection
    // — the X-in-corner was a one-off and broke that consistency.
    useChromeConfig({
        leftButtonText: '',
        centerButtonText: '',
        rightButtonText: '',
        leftButtonDisabled: false,
        centerButtonDisabled: false,
        rightButtonDisabled: false,
        onLeftButtonPress: handleClose,
        onCenterButtonPress: undefined,
        onRightButtonPress: undefined,
        overlayMode: false,
    });

    return (
        <View
            style={[StyleSheet.absoluteFill, styles.fullscreen]}
            testID="gallery-screen"
        >
            <View style={StyleSheet.absoluteFill}>
                <Room layout={layout} hiddenItemId={draggedRoomItemId} editing={editing} />
            </View>
            {/* Editor overlay — its grid + palette only paint in edit mode,
                but the Edit/Done chip lives inside it always. Sit it above
                the back button so the chip can't slip behind the safe-area
                top bar on tall devices. */}
            <RoomEditor
                layout={layout}
                onChange={(next) => setLayout(next)}
                onDragItemChange={setDraggedRoomItemId}
                bottomInset={insets.bottom + roomChromeLift}
                editing={editing}
                onEditingChange={setEditing}
            />
            <FooterBackBar
                onBack={handleClose}
                paddingBottom={footerInset}
                style={{ paddingTop: footerTopPadding }}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    fullscreen: {
        backgroundColor: colors.black,
    },
});

export default Gallery;
