// Adds jest-dom's custom matchers (toBeInTheDocument, toHaveTextContent, …).
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// With Vitest globals disabled, Testing Library can't auto-register cleanup, so
// we unmount rendered components after each test to keep the jsdom DOM isolated.
afterEach(() => cleanup());
