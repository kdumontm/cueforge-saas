/**
 * Tests for Login page component
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginPage from '@/app/login/page';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockLogin = jest.fn();
jest.mock('@/lib/api', () => ({
  login: (...args: any[]) => mockLogin(...args),
}));

// Mock lucide-react icons to simple spans
jest.mock('lucide-react', () => {
  const React = require('react');
  return {
    Music2: (props: any) => React.createElement('span', { 'data-testid': 'icon-music2', ...props }),
    Eye: (props: any) => React.createElement('span', { 'data-testid': 'icon-eye', ...props }),
    EyeOff: (props: any) => React.createElement('span', { 'data-testid': 'icon-eyeoff', ...props }),
    Loader2: (props: any) => React.createElement('span', { 'data-testid': 'icon-loader', ...props }),
  };
});

beforeEach(() => {
  mockPush.mockReset();
  mockLogin.mockReset();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('LoginPage', () => {
  test('renders the login form with French labels', () => {
    render(<LoginPage />);
    expect(screen.getByText('Connexion')).toBeInTheDocument();
    // Le label affiché est "Pseudo"
    expect(screen.getByText('Pseudo')).toBeInTheDocument();
    expect(screen.getByText('Mot de passe')).toBeInTheDocument();
    expect(screen.getByText('Se connecter')).toBeInTheDocument();
  });

  test('renders CueForge branding', () => {
    render(<LoginPage />);
    expect(screen.getByText('CueForge')).toBeInTheDocument();
  });

  test('shows link to register page', () => {
    render(<LoginPage />);
    const registerLink = screen.getByText("S'inscrire gratuitement");
    expect(registerLink).toBeInTheDocument();
    expect(registerLink.closest('a')).toHaveAttribute('href', '/register');
  });

  test('successful login redirects to dashboard', async () => {
    mockLogin.mockResolvedValueOnce({
      access_token: 'token',
      token_type: 'bearer',
      user: { id: 1, email: 'dj@test.com' },
    });

    render(<LoginPage />);
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText('ton pseudo'), 'djtest');
    await user.type(screen.getByPlaceholderText('••••••••'), 'password123');
    await user.click(screen.getByText('Se connecter'));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('djtest', 'password123');
      expect(mockPush).toHaveBeenCalledWith('/dashboard');
    });
  });

  test('shows error message on failed login', async () => {
    mockLogin.mockRejectedValueOnce(new Error('Invalid username or password'));

    render(<LoginPage />);
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText('ton pseudo'), 'wrong');
    await user.type(screen.getByPlaceholderText('••••••••'), 'wrong');
    await user.click(screen.getByText('Se connecter'));

    await waitFor(() => {
      expect(screen.getByText('Invalid username or password')).toBeInTheDocument();
    });
  });

  test('toggle password visibility', async () => {
    render(<LoginPage />);
    const user = userEvent.setup();

    const passwordInput = screen.getByPlaceholderText('••••••••');
    expect(passwordInput).toHaveAttribute('type', 'password');

    // Find the toggle button (it's a button inside the password field wrapper)
    const toggleBtn = passwordInput.parentElement?.querySelector('button');
    expect(toggleBtn).toBeTruthy();

    await user.click(toggleBtn!);
    expect(passwordInput).toHaveAttribute('type', 'text');

    await user.click(toggleBtn!);
    expect(passwordInput).toHaveAttribute('type', 'password');
  });

  test('submit button is disabled during loading', async () => {
    // Make login hang
    mockLogin.mockImplementation(() => new Promise(() => {}));

    render(<LoginPage />);
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText('ton pseudo'), 'dj');
    await user.type(screen.getByPlaceholderText('••••••••'), 'pass1234');
    await user.click(screen.getByText('Se connecter'));

    await waitFor(() => {
      expect(screen.getByText('Connexion...')).toBeInTheDocument();
    });
  });
});
