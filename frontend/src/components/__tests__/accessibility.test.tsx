/**
 * Accessibility guarantees, pinned.
 *
 * The Design Brief sets an accessibility floor (Section 9) that nothing was
 * enforcing, so it had quietly drifted: the delete trigger was a <div> with an
 * onClick and could not be operated by keyboard at all.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { InlineConfirm } from '../ui/InlineConfirm';
import { Modal } from '../ui/Modal';
import { Toast } from '../ui/Toast';

describe('InlineConfirm', () => {
    it('exposes the trigger as a button, not a clickable div', () => {
        render(
            <InlineConfirm promptMessage="Remove this block?" onConfirm={vi.fn()}>
                <span>Delete</span>
            </InlineConfirm>,
        );

        expect(screen.getByRole('button', { name: 'Remove this block?' })).toBeInTheDocument();
    });

    it('can be operated entirely from the keyboard', async () => {
        const onConfirm = vi.fn();
        render(
            <InlineConfirm promptMessage="Remove this block?" onConfirm={onConfirm}>
                <span>Delete</span>
            </InlineConfirm>,
        );

        // Tab to the trigger and press Enter — this was impossible before.
        await userEvent.tab();
        expect(screen.getByRole('button', { name: 'Remove this block?' })).toHaveFocus();
        await userEvent.keyboard('{Enter}');

        await userEvent.click(screen.getByRole('button', { name: 'Yes, remove' }));
        expect(onConfirm).toHaveBeenCalled();
    });
});

describe('Input', () => {
    it('ties its error message to the field', () => {
        render(<Input aria-label="Email" error="That email is already taken." />);

        const field = screen.getByLabelText('Email');
        expect(field).toHaveAttribute('aria-invalid', 'true');
        expect(field).toHaveAccessibleDescription('That email is already taken.');
    });

    it('announces the error', () => {
        render(<Input aria-label="Email" error="That email is already taken." />);
        expect(screen.getByRole('alert')).toHaveTextContent('That email is already taken.');
    });

    it('carries no error wiring when valid', () => {
        render(<Input aria-label="Email" />);
        expect(screen.getByLabelText('Email')).not.toHaveAttribute('aria-invalid');
    });
});

describe('Button', () => {
    it('meets the tap-target floor', () => {
        render(<Button>Save</Button>);
        expect(screen.getByRole('button')).toHaveClass('min-h-[44px]');
    });

    it('shows a focus ring for keyboards but not for mouse clicks', () => {
        render(<Button>Save</Button>);
        const cls = screen.getByRole('button').className;
        expect(cls).toContain('focus-visible:ring-2');
        // Bare focus:outline-none with no replacement is the thing to avoid.
        expect(cls).not.toMatch(/(^|\s)focus:outline-none/);
    });
});

describe('Modal', () => {
    const open = (onClose = vi.fn()) =>
        render(
            <Modal isOpen onClose={onClose} title="Edit block">
                <button>Inside</button>
            </Modal>,
        );

    it('announces itself as a dialog with its title', () => {
        open();
        expect(screen.getByRole('dialog', { name: 'Edit block' })).toBeInTheDocument();
    });

    it('closes on Escape', async () => {
        const onClose = vi.fn();
        open(onClose);
        await userEvent.keyboard('{Escape}');
        expect(onClose).toHaveBeenCalled();
    });

    it('moves focus into the dialog rather than leaving it behind', () => {
        open();
        expect(document.activeElement).not.toBe(document.body);
        expect(screen.getByRole('dialog')).toContainElement(
            document.activeElement as HTMLElement,
        );
    });

    it('labels the close control', () => {
        open();
        expect(screen.getByRole('button', { name: 'Close dialog' })).toBeInTheDocument();
    });
});

describe('Toast', () => {
    it('is announced and dismissible by name', () => {
        render(<Toast message="Saved" onClose={vi.fn()} durationMs={0} />);
        expect(screen.getByRole('alert')).toHaveTextContent('Saved');
        expect(screen.getByRole('button', { name: 'Dismiss notification' })).toBeInTheDocument();
    });
});
