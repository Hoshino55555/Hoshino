import AsyncStorage from '@react-native-async-storage/async-storage';

export interface MenuButton {
    id: string;
    name: string;
    icon: string;
    enabled: boolean;
    order: number;
    action: string;
}

export interface UserSettings {
    menuButtons: MenuButton[];
    theme: 'default' | 'dark' | 'mint';
    soundEnabled: boolean;
    notificationsEnabled: boolean;
}

const DEFAULT_MENU_BUTTONS: MenuButton[] = [
    { id: 'chat', name: 'Chat', icon: 'chat', enabled: true, order: 0, action: 'chat' },
    { id: 'feed', name: 'Feed', icon: 'feed', enabled: true, order: 1, action: 'feed' },
    { id: 'games', name: 'Games', icon: 'games', enabled: true, order: 2, action: 'games' },
    { id: 'sleep', name: 'Sleep', icon: 'sleep', enabled: true, order: 3, action: 'sleep' },
    { id: 'shop', name: 'Shop', icon: 'shop', enabled: true, order: 4, action: 'shop' },
    { id: 'inventory', name: 'Inventory', icon: 'inventory', enabled: true, order: 5, action: 'inventory' },
    { id: 'gallery', name: 'Gallery', icon: 'gallery', enabled: true, order: 6, action: 'gallery' },
    { id: 'settings', name: 'Settings', icon: 'settings', enabled: true, order: 7, action: 'settings' },
];

class SettingsService {
    private static instance: SettingsService;
    private settings: UserSettings;

    private constructor() {
        this.settings = {
            menuButtons: [...DEFAULT_MENU_BUTTONS],
            theme: 'default',
            soundEnabled: true,
            notificationsEnabled: true,
        };
    }

    static getInstance(): SettingsService {
        if (!SettingsService.instance) {
            SettingsService.instance = new SettingsService();
        }
        return SettingsService.instance;
    }

    async initialize(): Promise<void> {
        try {
            const savedSettings = await AsyncStorage.getItem('userSettings');
            if (savedSettings) {
                this.settings = { ...this.settings, ...JSON.parse(savedSettings) };
            }
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
    }

    async saveSettings(): Promise<void> {
        try {
            await AsyncStorage.setItem('userSettings', JSON.stringify(this.settings));
        } catch (error) {
            console.error('Failed to save settings:', error);
        }
    }

    getMenuButtons(): MenuButton[] {
        return this.settings.menuButtons
            .sort((a, b) => a.order - b.order);
    }

    async updateMenuButtonOrder(buttonId: string, newOrder: number): Promise<void> {
        const button = this.settings.menuButtons.find(b => b.id === buttonId);
        if (button) {
            button.order = newOrder;
            await this.saveSettings();
        }
    }

    async toggleMenuButton(buttonId: string, enabled: boolean): Promise<void> {
        const button = this.settings.menuButtons.find(b => b.id === buttonId);
        if (button) {
            button.enabled = enabled;
            await this.saveSettings();
        }
    }

    async resetMenuButtons(): Promise<void> {
        this.settings.menuButtons = [...DEFAULT_MENU_BUTTONS];
        await this.saveSettings();
    }

    async setMenuButtons(buttons: MenuButton[]): Promise<void> {
        this.settings.menuButtons = buttons;
        await this.saveSettings();
    }

    getTheme(): string {
        return this.settings.theme;
    }

    async setTheme(theme: string): Promise<void> {
        this.settings.theme = theme as any;
        await this.saveSettings();
    }

    isSoundEnabled(): boolean {
        return this.settings.soundEnabled;
    }

    async setSoundEnabled(enabled: boolean): Promise<void> {
        this.settings.soundEnabled = enabled;
        await this.saveSettings();
    }

    isNotificationsEnabled(): boolean {
        return this.settings.notificationsEnabled;
    }

    async setNotificationsEnabled(enabled: boolean): Promise<void> {
        this.settings.notificationsEnabled = enabled;
        await this.saveSettings();
    }

    getAllSettings(): UserSettings {
        return { ...this.settings };
    }
}

export default SettingsService; 