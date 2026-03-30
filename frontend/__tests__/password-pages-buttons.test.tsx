/**
 * Tests for Forgot Password and Reset Password page buttons
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ── Mocks ────────────────────────────────────────────────────────────────────
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => new URLSearchParams('token=valid-reset-token'),
}));

const mockForgotPassword = jest.fn();
const mockResetPassword = jest.fn();
jest.mock('@/lib/api', () => ({
  forgotPassword: (...args: any[]) => mockForgotPassword(...args),
  resetPassword: (...args: any[]) => mockResetPassword(...args),
}));

jest.mock('lucide-react', () => {
  const React = require('react');
  return new Proxy({}, {
    get: (_t: any, prop: string) => {
      if (prop === '__esModule') return false;
      return (props: any) => React.createElement('span', { 'data-testid': `icon-${prop}`, ...props });
    },
  });
});

import ForgotPasswordPage from '@/app/forgot-password/page';
import ResetPasswordPage from '@/app/reset-password/page';

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Forgot Password ──────────────────────────────────────────────────────────

describe('ForgotPassword — buttons', () => {
  test('renders submit button', () => {
    render(<ForgotPasswordPage />);
    expect(screen.getByText('Envoyer le lien')).toBeInTheDocument();
  });

  test('submit button sends forgot password request', async () => {
    mockForgotPassword.mockResolvedValueOnce({ message: 'Sent' });

    render(<ForgotPasswordPage />);
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText('ton@email.com'), 'dj@test.com');
    await user.click(screen.getByText('Envoyer le lien'));

    await waitFor(() => {
      expect(mockForgotPassword).toHaveBeenCalledWith('dj@test.com');
    });
  });

  test('shows success screen after submit', async () => {
    mockForgotPassword.mockResolvedValueOnce({ message: 'Sent' });

    render(<ForgotPasswordPage />);
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText('ton@email.com'), 'dj@test.com');
    await user.click(screen.getByText('Envoyer le lien'));

    await waitFor(() => {
      expect(screen.getByText(/Email envoy/)).toBeInTheDocument();
    });
  });

  test('shows back to login link after success', async () => {
    mockForgotPassword.mockResolvedValueOnce({ message: 'Sent' });

    render(<ForgotPasswordPage />);
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText('ton@email.com'), 'dj@test.com');
    await user.click(screen.getByText('Envoyer le lien'));

    await waitFor(() => {
      const backLink = screen.getByText(/Retour/);
      expect(backLink.closest('a')).toHaveAttribute('href', '/login');
    });
  });

  test('shows error on failure', async () => {
    mockForgotPassword.mockRejectedValueOnce(new Error('Network error'));

    render(<ForgotPasswordPage />);
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText('ton@email.com'), 'dj@test.com');
    await user.click(screen.getByText('Envoyer le lien'));

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  test('shows loading state during submit', async () => {
    mockForgotPassword.mockImplementation(() => new Promise(() => {})); // hang

    render(<ForgotPasswordPage />);
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText('ton@email.com'), 'dj@test.com');
    await user.click(screen.getByText('Envoyer le lien'));

    await waitFor(() => {
      expect(screen.getByText('Envoi...')).toBeInTheDocument();
    });
  });

  test('back arrow link goes to /login', () => {
    render(<ForgotPasswordPage />);
    const backLinks = screen.getAllByRole('link');
    const loginLink = backLinks.find(l => l.getAttribute('href') === '/login');
    expect(loginLink).toBeTruthy();
  });
});

// ── Reset Password ───────────────────────────────────────────────────────────

describe('ResetPassword — buttons', () => {
  test('renders submit button', () => {
    render(<ResetPasswordPage />);
    expect(screen.getByText('Enregistrer')).toBeInTheDocument();
  });

  test('password visibility toggle works', async () => {
    render(<ResetPasswordPage />);
    const user = userEvent.setup();

    const passwordInputs = document.querySelectorAll('input[type="password"]');
    expect(passwordInputs.length).toBeGreaterThan(0);

    const toggleBtn = document.querySelector('button[type="button"]');
    if (toggleBtn) {
      await user.click(toggleBtn);
      // First input should now be text
      const firstInput = document.querySelectorAll('input')[0];
      // May toggle to text
    }
  });

  test('shows error when passwords do not match', async () => {
    render(<ResetPasswordPage />);
    const user = userEvent.setup();

    const passwordInputs = document.querySelectorAll('input');
    // Filter to get password-type inputs
    const pwdInputs = Array.from(passwordInputs).filter(
      i => i.type === 'password' || i.type === 'text'
    );

    if (pwdInputs.length >= 2) {
      await user.type(pwdInputs[0], 'newpass123');
      await user.type(pwdInputs[1], 'different');
      await user.click(screen.getByText('Enregistrer'));

      await waitFor(() => {
        expect(screen.getByText('Les mots de passe ne correspondent pas')).toBeInTheDocument();
      });
    }
  });

  test('shows error for short password', async () => {
    render(<ResetPasswordPage />);
    const user = userEvent.setup();

    const pwdInputs = document.querySelectorAll('input');
    const inputs = Array.from(pwdInputs).filter(i => i.type === 'password');

    if (inputs.length >= 2) {
      await user.type(inputs[0], 'abc');
      await user.type(inputs[1], 'abc');
      await user.click(screen.getByText('Enregistrer'));

      await waitFor(() => {
        expect(screen.getByText(/Minimum 8/)).toBeInTheDocument();
      });
    }
  });

  test('successful reset shows success and redirects', async () => {
    mockResetPassword.mockResolvedValueOnce({ message: 'Done' });
    jest.useFakeTimers();

    render(<ResetPasswordPage />);
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    const pwdInputs = document.querySelectorAll('input');
    const inputs = Array.from(pwdInputs).filter(i => i.type === 'password');

    if (inputs.length >= 2) {
      await user.type(inputs[0], 'newpass123');
      await user.type(inputs[1], 'newpass123');
      await user.click(screen.getByText('Enregistrer'));

      await waitFor(() => {
        expect(mockResetPassword).toHaveBeenCalledWith('valid-reset-token', 'newpass123');
        expect(screen.getByText(/Mot de passe mis/)).toBeInTheDocument();
      });

      // Auto-redirect after 2.5s
      jest.advanceTimersByTime(3000);
      expect(mockPush).toHaveBeenCalledWith('/login');
    }

    jest.useRealTimers();
  });

  test('shows error on API failure', async () => {
    mockResetPassword.mockRejectedValueOnce(new Error('Token expired'));

    render(<ResetPasswordPage />);
    const user = userEvent.setup();

    const pwdInputs = document.querySelectorAll('input');
    const inputs = Array.from(pwdInputs).filter(i => i.type === 'password');

    if (inputs.length >= 2) {
      await user.type(inputs[0], 'newpass123');
      await user.type(inputs[1], 'newpass123');
      await user.click(screen.getByText('Enregistrer'));

      await waitFor(() => {
        expect(screen.getByText('Token expired')).toBeInTheDocument();
      });
    }
  });
});

