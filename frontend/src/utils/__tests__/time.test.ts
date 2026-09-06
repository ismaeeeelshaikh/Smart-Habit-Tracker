import { describe, expect, it } from 'vitest';
import { formatTime, formatTimeRange } from '../time';

describe('formatTime', () => {
    it('converts an afternoon time', () => {
        expect(formatTime('17:00:00')).toBe('5:00 PM');
    });

    it('accepts a full ISO datetime', () => {
        expect(formatTime('2026-09-07T17:30:00')).toBe('5:30 PM');
    });

    it('does not zero-pad a morning hour', () => {
        expect(formatTime('09:05:00')).toBe('9:05 AM');
    });

    // Midnight and noon are where 12-hour clocks usually go wrong.
    it('shows midnight as 12 AM, not 0', () => {
        expect(formatTime('00:15:00')).toBe('12:15 AM');
    });

    it('shows noon as 12 PM, not 0', () => {
        expect(formatTime('12:00:00')).toBe('12:00 PM');
    });

    it('keeps 11:59 in the morning', () => {
        expect(formatTime('11:59:00')).toBe('11:59 AM');
    });

    it('flips to PM one minute after noon', () => {
        expect(formatTime('12:01:00')).toBe('12:01 PM');
    });

    it('handles the last minute of the day', () => {
        expect(formatTime('23:59:00')).toBe('11:59 PM');
    });

    it('passes something unparseable straight through', () => {
        expect(formatTime('not a time')).toBe('not a time');
    });

    it('returns empty for empty input rather than "NaN:00 AM"', () => {
        expect(formatTime('')).toBe('');
    });
});

describe('formatTimeRange', () => {
    it('reads as a range', () => {
        expect(formatTimeRange('09:00:00', '17:00:00')).toBe('9:00 AM – 5:00 PM');
    });
});
