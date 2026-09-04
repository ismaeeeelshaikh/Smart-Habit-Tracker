import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../ui/Button';
import { createLinkCode, getLinkStatus } from '../../api';
import type { LinkCode } from '../../types';

const POLL_INTERVAL_MS = 4000;
/** Stop nagging the server after ten minutes of nobody opening Telegram. */
const POLL_LIMIT_MS = 10 * 60 * 1000;

interface TelegramConnectProps {
    /** Fired once, when polling first sees the account linked. */
    onConnected?: () => void;
}

export const TelegramConnect = ({ onConnected }: TelegramConnectProps) => {
    const [link, setLink] = useState<LinkCode | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isExpired, setIsExpired] = useState(false);
    const [gaveUpWaiting, setGaveUpWaiting] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [copied, setCopied] = useState(false);

    // Ref, not state: the poll effect reads it without wanting to restart on change.
    const onConnectedRef = useRef(onConnected);
    onConnectedRef.current = onConnected;

    const generate = useCallback(async () => {
        setError(null);
        setIsExpired(false);
        setGaveUpWaiting(false);
        setCopied(false);
        setIsGenerating(true);
        try {
            setLink(await createLinkCode());
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Couldn't generate a code. Please try again.",
            );
        } finally {
            setIsGenerating(false);
        }
    }, []);

    useEffect(() => {
        if (!link || isConnected || isExpired || gaveUpWaiting) return;

        const startedAt = Date.now();
        const expiresAt = new Date(link.expires_at).getTime();
        let cancelled = false;

        const tick = async () => {
            if (Date.now() >= expiresAt) {
                setIsExpired(true);
                return;
            }
            if (Date.now() - startedAt >= POLL_LIMIT_MS) {
                setGaveUpWaiting(true);
                return;
            }
            try {
                const status = await getLinkStatus();
                if (!cancelled && status.linked) {
                    setIsConnected(true);
                    onConnectedRef.current?.();
                }
            } catch {
                // A blip shouldn't kill the wait; the next tick tries again.
            }
        };

        const id = setInterval(tick, POLL_INTERVAL_MS);
        return () => {
            cancelled = true;
            clearInterval(id);
        };
    }, [link, isConnected, isExpired, gaveUpWaiting]);

    const copy = async () => {
        if (!link) return;
        try {
            await navigator.clipboard.writeText(link.code);
            setCopied(true);
        } catch {
            // Clipboard access can be denied; the code is on screen to type anyway.
        }
    };

    if (isConnected) {
        return (
            <div className="py-6 text-center space-y-2">
                <p className="text-[15px] font-inter font-medium text-[var(--color-free)]">
                    Connected ✅
                </p>
                <p className="text-[13px] text-[var(--color-ink-muted)]">
                    You'll start receiving reminders.
                </p>
            </div>
        );
    }

    if (!link) {
        return (
            <div className="py-6 flex flex-col items-center gap-3">
                <Button onClick={generate} disabled={isGenerating}>
                    {isGenerating ? 'Generating…' : 'Generate linking code'}
                </Button>
                {error && <p className="text-[13px] text-[var(--color-error)]">{error}</p>}
            </div>
        );
    }

    return (
        <div className="py-6 space-y-4">
            <div className="flex flex-col items-center gap-2">
                <code className="font-mono text-[24px] tracking-[0.2em] px-4 py-2 rounded-[8px] bg-[var(--color-free-tint)] text-[var(--color-ink)]">
                    {link.code}
                </code>
                <button
                    onClick={copy}
                    className="text-[13px] font-medium text-[var(--color-free)] hover:brightness-90"
                >
                    {copied ? 'Copied' : 'Copy code'}
                </button>
            </div>

            <p className="text-[13px] text-[var(--color-ink-muted)] text-center">
                Open Telegram, message{' '}
                <span className="font-medium text-[var(--color-ink)]">
                    @{link.bot_username || 'the bot'}
                </span>
                , and send this code.
            </p>

            {link.bot_username && (
                <p className="text-center">
                    <a
                        href={`https://t.me/${link.bot_username}?start=${link.code}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[13px] font-medium text-[var(--color-free)] hover:brightness-90"
                    >
                        Open Telegram
                    </a>
                </p>
            )}

            {isExpired ? (
                <p className="text-[13px] text-center text-[var(--color-ink-muted)]">
                    This code expired.{' '}
                    <button
                        onClick={generate}
                        className="font-medium text-[var(--color-free)] hover:brightness-90"
                    >
                        Generate a new code
                    </button>
                </p>
            ) : gaveUpWaiting ? (
                <p className="text-[13px] text-center text-[var(--color-ink-muted)]">
                    Still waiting — you can finish setup and connect Telegram later from Settings.
                </p>
            ) : (
                <p className="text-[13px] text-center text-[var(--color-ink-muted)]">
                    Waiting for connection…
                </p>
            )}

            {error && (
                <p className="text-[13px] text-center text-[var(--color-error)]">{error}</p>
            )}
        </div>
    );
};
