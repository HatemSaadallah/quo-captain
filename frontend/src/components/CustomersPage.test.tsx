import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockFetch } from '../test-utils';
import { CustomersPage } from './CustomersPage';

describe('Customers list', () => {
  it('paginates, sorts, searches and opens customer information', async () => {
    const customers = Array.from({ length: 12 }, (_, index) => ({ id: `customer-${index + 1}`, name: `Customer ${String(index + 1).padStart(2, '0')}` }));
    mockFetch((_method, path) => path === '/api/customers' ? customers : []);
    render(<CustomersPage onError={vi.fn()} />);
    const user = userEvent.setup();
    await screen.findByRole('button', { name: 'Customer 01' });
    expect(screen.queryByRole('button', { name: 'Customer 11' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('button', { name: 'Customer 11' })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Sort customers'), 'name-desc');
    expect(screen.getByRole('button', { name: 'Customer 12' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Customer 01' })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Search customers'), 'Customer 02');
    expect(screen.getByRole('button', { name: 'Customer 02' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Customer 12' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Customer 02' }));
    expect(window.location.hash).toBe('#/customers/customer-2');
  });
});
