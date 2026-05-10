import {
    AudioPlayer,
    createAudioPlayer,
    setAudioModeAsync,
} from 'expo-audio';
import { Audio } from '../assets';
import SettingsService, { SoundLevel } from './SettingsService';

// Settings exposes a 5-step volume slider (0–4). Map each step to a linear
// gain so level 0 mutes outright and 4 plays at full bus level.
const VOLUME_BY_LEVEL: Record<SoundLevel, number> = {
    0: 0,
    1: 0.25,
    2: 0.5,
    3: 0.75,
    4: 1.0,
};

class MusicService {
    private static instance: MusicService;
    private player: AudioPlayer | null = null;
    // Set true while the moonoko is sleeping — the screen is supposed to
    // feel quiet, so we duck the loop until they wake up.
    private paused = false;

    static getInstance(): MusicService {
        if (!MusicService.instance) MusicService.instance = new MusicService();
        return MusicService.instance;
    }

    async start(): Promise<void> {
        if (this.player) return;
        try {
            // Hydrate the persisted slider value before we read it for the
            // initial volume — otherwise a fresh session boots at the default
            // (level 3) and snaps to the user's setting a tick later.
            await SettingsService.getInstance().initialize();
            // Default audio session mutes when the device is on silent. Music
            // is a foreground UX element here, so override it.
            await setAudioModeAsync({ playsInSilentMode: true });
            this.player = createAudioPlayer(Audio.theme);
            this.player.loop = true;
            this.applyVolume();
            if (!this.paused && this.player.volume > 0) {
                this.player.play();
            }
        } catch (e) {
            console.warn('music start failed', e);
        }
    }

    setPaused(paused: boolean): void {
        this.paused = paused;
        if (!this.player) return;
        if (paused) {
            this.player.pause();
        } else if (this.player.volume > 0) {
            this.player.play();
        }
    }

    syncVolume(): void {
        this.applyVolume();
    }

    private applyVolume(): void {
        if (!this.player) return;
        const level = SettingsService.getInstance().getSoundLevel();
        this.player.volume = VOLUME_BY_LEVEL[level];
        if (level === 0) {
            this.player.pause();
        } else if (!this.paused) {
            this.player.play();
        }
    }
}

export default MusicService;
