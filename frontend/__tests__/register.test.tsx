/**
 * Tests for Register page component
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RegisterPage from '@/app/register/page';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockRegister = jest.fn();
const mockLogin = jest.fn();
jest.mock('@/lib/api', () => ({
  register: (...args: any[]) => mockRegister(...args),
  login: (...args: any[]) => mockLogin(...args),
}));

jest.mock('lucide-react', () => {
  const React = require('react');
  return {
    Music2: (props: any) => React.createElement('span', { 'data-testid': 'icon-music2', ...props }),
    Eye: (props: any) => React.createElement('span', { 'data-testid': 'icon-eye', ...props }),
    EyeOff: (props: any) => React.createElement('span', { 'data-testid': 'icon-eyeoff', ...props }),
    Loader2: (props: any) => React.createElement('span', { 'data-testid': 'icon-loader', ...props }),
    Check: (props: any) => React.createElement('span', { 'data-testid': 'icon-check', ...props }),
  };
});

// Helper to get inputs by their order (since placeholder text has unicode issues)
function getInputs() {
  const inputs = screen.getAllByRole('textbox');
  const passwordInputs = screen.getAllByDisplayValue('');
  // The form has: username (text), email (email), password (password), confirm (password)
  // getAllByRole('textbox') returns text + email inputs
  // We need to get password inputs differently
  return {
    username: screen.getByPlaceholderText('ton_pseudo'),
    email: screen.getByPlaceholderText('ton@email.com'),
  };
}

function getPasswordInputs() {
  // Get all password inputs - there should be 2 (password + confirm)
  const allInputs = document.querySelectorAll('input[type="password"]');
  return {
    password: allInputs[0] as HTMLInputElement,
    confirm: allInputs[1] as HTMLInputElement,
  };
}

beforeEach(() => {
  mockPush.mockReset();
  mockRegister.mockReset();
  mockLogin.mockReset();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('RegisterPage', () => {
  test('renders the registration form with French labels', () => {
    render(<RegisterPage />);
    // Use heading role for the h1
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Mot de passe')).toBeInTheDocument();
    expect(screen.getByText('Confirmer le mot de passe')).toBeInTheDocument();
    // Submit button
    expect(screen.getByRole('button', { name: /Cr.er mon compte/ })).toBeInTheDocument();
  });

  test('shows feature highlights', () => {
    render(<RegisterPage />);
    expect(screen.getByText('BPM auto')).toBeInTheDocument();
    expect(screen.getByText('Cue points')).toBeInTheDocument();
    expect(screen.getByText('Export XML')).toBeInTheDocument();
  });

  test('shows link to login page', () => {
    render(<RegisterPage />);
    const loginLink = screen.getByText('Se connecter');
    expect(loginLink.closest('a')).toHaveAttribute('href', '/login');
  });

  test('password strength indicator shows weak for short password', async () => {
    render(<RegisterPage />);
    const user = userEvent.setup();
    const { password } = getPasswordInputs();

    await user.type(password, 'abc');

    await waitFor(() => {
      expect(screen.getByText(/Trop court/)).toBeInTheDocument();
    });
  });

  test('password strength indicator shows valid for 8+ chars', async () => {
    render(<RegisterPage />);
    const user = userEvent.setup();
    const { password } = getPasswordInputs();

    await user.type(password, 'secure123');

    await waitFor(() => {
      expect(screen.getByText('Mot de passe valide')).toBeInTheDocument();
    });
  });

  test('password match indicator shows when matching', async () => {
    render(<RegisterPage />);
    const user = userEvent.setup();
    const { password, confirm } = getPasswordInputs();

    await user.type(password, 'secure123');
    await user.type(confirm, 'secure123');

    await waitFor(() => {
      expect(screen.getByText('Les mots de passe correspondent')).toBeInTheDocument();
    });
  });

  test('password match indicator shows when not matching', async () => {
    render(<RegisterPage />);
    const user = userEvent.setup();
    const { password, confirm } = getPasswordInputs();

    await user.type(password, 'secure123');
    await user.type(confirm, 'different');

    await waitFor(() => {
      expect(screen.getByText('Ne correspondent pas')).toBeInTheDocument();
    });
  });

  test('shows error when username is empty on submit', async () => {
    render(<RegisterPage />);
    const user = userEvent.setup();
    const { username, email } = getInputs();
    const { password, confirm } = getPasswordInputs();

    await user.type(username, ' ');
    await user.type(email, 'test@dj.com');
    await user.type(password, 'secure123');
    await user.type(confirm, 'secure123');

    await user.click(screen.getByRole('button', { name: /Cr.er mon compte/ }));

    await waitFor(() => {
      expect(screen.getByText("Le nom d'utilisateur est requis")).toBeInTheDocument();
    });
  });

  test('shows error when passwords do not match on submit', async () => {
    render(<RegisterPage />);
    const user = userEvent.setup();
    const { username, email } = getInputs();
    const { password, confirm } = getPasswordInputs();

    await user.type(username, 'newdj');
    await user.type(email, 'new@dj.com');
    await user.type(password, 'secure123');
    await user.type(confirm, 'different1');

    await user.click(screen.getByRole('button', { name: /Cr.er mon compte/ }));

    await waitFor(() => {
      expect(screen.getByText('Les mots de passe ne correspondent pas')).toBeInTheDocument();
    });
  });

  test('successful registration calls register then login and redirects', async () => {
    mockRegister.mockResolvedValueOnce({
      access_token: 'new-token',
      token_type: 'bearer',
      user: { id: 2, email: 'new@dj.com' },
    });
    mockLogin.mockResolvedValueOnce({
      access_token: 'new-token',
      token_type: 'bearer',
      user: { id: 2, email: 'new@dj.com' },
    });

    render(<RegisterPage />);
    const user = userEvent.setup();
    const { username, email } = getInputs();
    const { password, confirm } = getPasswordInputs();

    await user.type(username, 'newdj');
    await user.type(email, 'new@dj.com');
    await user.type(password, 'secure123');
    await user.type(confirm, 'secure123');

    await user.click(screen.getByRole('button', { name: /Cr.er mon compte/ }));

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith('new@dj.com', 'secure123', 'newdj');
      expect(mockLogin).toHaveBeenCalledWith('newdj', 'secure123');
      expect(mockPush).toHaveBeenCalledWith('/dashboard');
    });
  });

  test('shows error when registration fails', async () => {
    mockRegister.mockRejectedValueOnce(new Error('Email already registered'));

    render(<RegisterPage />);
    const user = userEvent.setup();
    const { username, email } = getInputs();
    const { password, confirm } = getPasswordInputs();

    await user.type(username, 'newdj');
    await user.type(email, 'dup@dj.com');
    await user.type(password, 'secure123');
    await user.type(confirm, 'secure123');

    await user.click(screen.getByRole('button', { name: /Cr.er mon compte/ }));

    await waitFor(() => {
      expect(screen.getByText('Email already registered')).toBeInTheDocument();
    });
  });
});
