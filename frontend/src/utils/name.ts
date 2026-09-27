import type { User } from '../types';

/**
 * What to call the user: the first word of their name, or — for an account
 * made before signup asked for one — the part of their email before the @.
 */
export const firstName = (user: Pick<User, 'full_name' | 'email'> | null | undefined): string =>
    user?.full_name?.trim().split(/\s+/)[0] || user?.email?.split('@')[0] || '';
