/**
 * Tests for Landing page (app/page.tsx)
 */
import { render, screen } from '@testing-library/react';
import LandingPage from '@/app/page';

// Mock lucide-react
jest.mock('lucide-react', () => {
  const React = require('react');
  const mockIcon = (props: any) => React.createElement('span', props);
  return new Proxy({}, {
    get: (_target: any, prop: string) => {
      if (prop === '__esModule') return false;
      return mockIcon;
    },
  });
});

describe('LandingPage', () => {
  test('renders hero section', () => {
    render(<LandingPage />);
    const matches = screen.getAllByText(/CueForge/);
    expect(matches.length).toBeGreaterThan(0);
  });

  test('renders navigation links', () => {
    render(<LandingPage />);
    const links = screen.getAllByRole('link');
    const hrefs = links.map(l => l.getAttribute('href'));
    expect(hrefs).toContain('/login');
    expect(hrefs).toContain('/register');
  });

  test('renders feature cards', () => {
    render(<LandingPage />);
    // Should mention key features (may appear multiple times)
    const matches = screen.getAllByText(/Rekordbox/i);
    expect(matches.length).toBeGreaterThan(0);
  });

  test('renders CTA buttons to register', () => {
    render(<LandingPage />);
    const registerLinks = screen.getAllByRole('link').filter(
      l => l.getAttribute('href') === '/register'
    );
    expect(registerLinks.length).toBeGreaterThan(0);
  });
});
