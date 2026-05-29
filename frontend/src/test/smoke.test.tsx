import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

describe('vitest setup', () => {
  it('renders a simple component', () => {
    render(<div>Hello vitest</div>);
    expect(screen.getByText('Hello vitest')).toBeInTheDocument();
  });
});
