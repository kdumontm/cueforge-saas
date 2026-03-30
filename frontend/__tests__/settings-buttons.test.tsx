/**
 * Tests for Settings page buttons
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SettingsPage from '@/app/settings/page';

// ── Mocks ────────────────────────────────────────────────────────────────────
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockGetMyProfile = jest.fn();
const mockUpdateMyProfile = jest.fn();
jest.mock('@/lib/api', () => ({
  getMyProfile: (...args: any[]) => mockGetMyProfile(...args),
  updateMyProfile: (...args: any[]) => mockUpdateMyProfile(...args),
}));

const mockProfile = {
  id: 1,
  email: 'dj@test.com',
  name: 'DJ Test',
  subscription_plan: 'pro',
  is_admin: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.setItem('cueforge_token', 'test-token');
  mockGetMyProfile.mockResolvedValue(mockProfile);
});

afterEach(() => {
  localStorage.clear();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Settings — page load', () => {
  test('redirects to login if no token', () => {
    localStorage.clear();
    render(<SettingsPage />);
    expect(mockPush).toHaveBeenCalledWith('/login');
  });

  test('loads and displays profile data', async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      expect(mockGetMyProfile).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getByDisplayValue('DJ Test')).toBeInTheDocument();
      expect(screen.getByDisplayValue('dj@test.com')).toBeInTheDocument();
    });
  });

  test('shows subscription plan', async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText(/Pro/)).toBeInTheDocument();
    });
  });
});

describe('Settings — Dashboard button', () => {
  test('back to dashboard button navigates', async () => {
    render(<SettingsPage />);
    await waitFor(() => expect(mockGetMyProfile).toHaveBeenCalled());

    const user = userEvent.setup();
    const dashBtn = screen.getByText(/Dashboard/);
    await user.click(dashBtn);
    expect(mockPush).toHaveBeenCalledWith('/dashboard');
  });
});

describe('Settings — Voir les plans button', () => {
  test('pricing button navigates to /pricing', async () => {
    render(<SettingsPage />);
    await waitFor(() => expect(mockGetMyProfile).toHaveBeenCalled());

    const user = userEvent.setup();
    const pricingBtn = screen.getByText('Voir les plans');
    await user.click(pricingBtn);
    expect(mockPush).toHaveBeenCalledWith('/pricing');
  });
});

describe('Settings — Save profile button', () => {
  test('Enregistrer button submits profile changes', async () => {
    mockUpdateMyProfile.mockResolvedValueOnce({ ...mockProfile, name: 'DJ Updated' });

    render(<SettingsPage />);
    await waitFor(() => expect(screen.getByDisplayValue('DJ Test')).toBeInTheDocument());

    const user = userEvent.setup();
    const nameInput = screen.getByDisplayValue('DJ Test');
    await user.clear(nameInput);
    await user.type(nameInput, 'DJ Updated');

    await user.click(screen.getByText('Enregistrer'));

    await waitFor(() => {
      expect(mockUpdateMyProfile).toHaveBeenCalledWith({ name: 'DJ Updated' });
    });
  });

  test('shows success message after save', async () => {
    mockUpdateMyProfile.mockResolvedValueOnce({ ...mockProfile, name: 'DJ Updated' });

    render(<SettingsPage />);
    await waitFor(() => expect(screen.getByDisplayValue('DJ Test')).toBeInTheDocument());

    const user = userEvent.setup();
    const nameInput = screen.getByDisplayValue('DJ Test');
    await user.clear(nameInput);
    await user.type(nameInput, 'DJ Updated');
    await user.click(screen.getByText('Enregistrer'));

    await waitFor(() => {
      expect(screen.getByText(/Profil mis/)).toBeInTheDocument();
    });
  });

  test('shows info message when no changes', async () => {
    render(<SettingsPage />);
    await waitFor(() => expect(screen.getByDisplayValue('DJ Test')).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByText('Enregistrer'));

    await waitFor(() => {
      expect(screen.getByText('Aucune modification')).toBeInTheDocument();
    });
  });

  test('shows error message on save failure', async () => {
    mockUpdateMyProfile.mockRejectedValueOnce(new Error('Server error'));

    render(<SettingsPage />);
    await waitFor(() => expect(screen.getByDisplayValue('DJ Test')).toBeInTheDocument());

    const user = userEvent.setup();
    const nameInput = screen.getByDisplayValue('DJ Test');
    await user.clear(nameInput);
    await user.type(nameInput, 'New Name');
    await user.click(screen.getByText('Enregistrer'));

    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument();
    });
  });
});

describe('Settings — Change password button', () => {
  test('shows error when passwords do not match', async () => {
    render(<SettingsPage />);
    await waitFor(() => expect(screen.getByDisplayValue('DJ Test')).toBeInTheDocument());

    const user = userEvent.setup();
    const passwordInputs = document.querySelectorAll('input[type="password"]');
    expect(passwordInputs.length).toBe(3);

    await user.type(passwordInputs[0], 'oldpass');
    await user.type(passwordInputs[1], 'newpass123');
    await user.type(passwordInputs[2], 'different');

    await user.click(screen.getByRole('button', { name: /Changer le mot de passe/ }));

    await waitFor(() => {
      expect(screen.getByText('Les mots de passe ne correspondent pas')).toBeInTheDocument();
    });
  });

  test('shows error when password too short', async () => {
    render(<SettingsPage />);
    await waitFor(() => expect(screen.getByDisplayValue('DJ Test')).toBeInTheDocument());

    const user = userEvent.setup();
    const passwordInputs = document.querySelectorAll('input[type="password"]');

    await user.type(passwordInputs[0], 'oldpass');
    await user.type(passwordInputs[1], 'ab');
    await user.type(passwordInputs[2], 'ab');

    await user.click(screen.getByRole('button', { name: /Changer le mot de passe/ }));

    await waitFor(() => {
      expect(screen.getByText(/au moins 6/)).toBeInTheDocument();
    });
  });

  test('successful password change shows success', async () => {
    mockUpdateMyProfile.mockResolvedValueOnce(mockProfile);

    render(<SettingsPage />);
    await waitFor(() => expect(screen.getByDisplayValue('DJ Test')).toBeInTheDocument());

    const user = userEvent.setup();
    const passwordInputs = document.querySelectorAll('input[type="password"]');

    await user.type(passwordInputs[0], 'oldpassword');
    await user.type(passwordInputs[1], 'newpass123');
    await user.type(passwordInputs[2], 'newpass123');

    await user.click(screen.getByRole('button', { name: /Changer le mot de passe/ }));

    await waitFor(() => {
      expect(mockUpdateMyProfile).toHaveBeenCalledWith({
        current_password: 'oldpassword',
        new_password: 'newpass123',
      });
      expect(screen.getByText(/Mot de passe modifi/)).toBeInTheDocument();
    });
  });
});
