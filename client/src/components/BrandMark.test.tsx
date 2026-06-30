import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import BrandMark from './BrandMark';

// Smoke test that proves the jsdom + Testing Library + MUI pipeline works, so
// component tests can grow from here.
describe('<BrandMark />', () => {
  it('renders the wordmark', () => {
    render(<BrandMark />);
    expect(screen.getByText('A-Meet')).toBeInTheDocument();
  });

  it('renders the wordmark at the large size', () => {
    render(<BrandMark size="lg" />);
    expect(screen.getByText('A-Meet')).toBeInTheDocument();
  });
});
