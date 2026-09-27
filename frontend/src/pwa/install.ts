import { useSyncExternalStore } from 'react';

/** Chrome / Edge / Android's install event. Not in the DOM typings yet. */
interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface InstallState {
    /** The browser offered an install prompt we can show on a tap. */
    canPrompt: boolean;
    /** Already running as an installed app. */
    installed: boolean;
    /** iPhone / iPad Safari: no prompt exists, installing is Share → Add to Home Screen. */
    isIOS: boolean;
}

let deferred: BeforeInstallPromptEvent | null = null;
let state: InstallState = { canPrompt: false, installed: false, isIOS: false };
const listeners = new Set<() => void>();

const set = (next: Partial<InstallState>) => {
    state = { ...state, ...next };
    listeners.forEach((l) => l());
};

/**
 * Called once at startup. The browser fires beforeinstallprompt early — long
 * before anyone opens Settings — so it has to be caught here and kept.
 */
export const initInstallPrompt = () => {
    if (typeof window === 'undefined') return;
    const standalone =
        window.matchMedia?.('(display-mode: standalone)').matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const isIOS =
        /iphone|ipad|ipod/i.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    set({ installed: Boolean(standalone), isIOS });

    window.addEventListener('beforeinstallprompt', (e) => {
        // Keep it for our own button instead of the browser's mini-bar.
        e.preventDefault();
        deferred = e as BeforeInstallPromptEvent;
        set({ canPrompt: true });
    });
    window.addEventListener('appinstalled', () => {
        deferred = null;
        set({ canPrompt: false, installed: true });
    });
};

/** Shows the browser's install dialog. True if the user said yes. */
export const promptInstall = async (): Promise<boolean> => {
    if (!deferred) return false;
    const event = deferred;
    await event.prompt();
    const { outcome } = await event.userChoice;
    // A prompt can only be shown once; the browser offers a new one later.
    deferred = null;
    set({ canPrompt: false, installed: outcome === 'accepted' || state.installed });
    return outcome === 'accepted';
};

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

export const useInstallState = (): InstallState => useSyncExternalStore(subscribe, () => state);
