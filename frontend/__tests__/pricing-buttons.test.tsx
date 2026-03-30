/**
 * Tests for Pricing page buttons and links
 */
import { render, screen, waitFor } from '@testing-library/react';
import PricingPage from '@/app/pricing/page';

// ── Mocks ────────────────────────────────────────────────────────────────────
const mockGetPublicPageSettings = jest.fn();
jest.mock('@/lib/api', () => ({
  getPublicPageSettings: (...args: any[]) => mockGetPublicPageSettings(...args),
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

beforeEach(() => {
  jest.clearAllMocks();
  mockGetPublicPageSettings.mockResolvedValue([{ page_name: 'pricing', is_enabled: true }]);
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('PricingPage — plan buttons', () => {
  test('renders three plan CTA buttons', async () => {
    render(<PricingPage />);
    await waitFor(() => {
      expect(screen.getByText('Commencer gratuitement')).toBeInTheDocument();
      expect(screen.getByText('Passer Pro')).toBeInTheDocument();
    });
  });

  test('renders plan names', async () => {
    render(<PricingPage />);
    await waitFor(() => {
      expect(screen.getByText('Free')).toBeInTheDocument();
      expect(screen.getByText('Pro')).toBeInTheDocument();
      expect(screen.getByText('App Desktop')).toBeInTheDocument();
    });
  });

  test('renders Pro plan with Popular badge', async () => {
    render(<PricingPage />);
    await waitFor(() => {
      expect(screen.getByText('Populaire')).toBeInTheDocument();
    });
  });

  test('back to dashboard link exists', async () => {
    render(<PricingPage />);
    await waitFor(() => {
      const links = screen.getAllByRole('link');
      const dashLink = links.find(l => l.getAttribute('href') === '/dashboard');
      expect(dashLink).toBeTruthy();
    });
  });

  test('FAQ sections are expandable', async () => {
    render(<PricingPage />);
    await waitFor(() => {
      const details = document.querySelectorAll('details');
      expect(details.length).toBe(4);
    });
  });

  test('renders pricing amounts', async () => {
    render(<PricingPage />);
    await waitFor(() => {
      expect(screen.getByText('Gratuit')).toBeInTheDocument();
      // Check the price text appears
      const priceElements = screen.getAllByText(/9.99/);
      expect(priceElements.length).toBeGreaterThan(0);
    });
  });
});

describe('PricingPage — disabled state', () => {
  test('shows disabled message when page is turned off', async () => {
    mockGetPublicPageSettings.mockResolvedValue([{ page_name: 'pricing', is_enabled: false }]);

    render(<PricingPage />);
    await waitFor(() => {
      expect(screen.getByText('Page non disponible')).toBeInTheDocument();
    });
  });

  test('shows dashboard link when disabled', async () => {
    mockGetPublicPageSettings.mockResolvedValue([{ page_name: 'pricing', is_enabled: false }]);

    render(<PricingPage />);
    await waitFor(() => {
      const link = screen.getByText('Retour au dashboard');
      expect(link.closest('a')).toHaveAttribute('href', '/dashboard');
    });
  });
});
