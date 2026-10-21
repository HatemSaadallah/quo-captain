import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProjectsPage } from './ProjectsPage';
import { mockFetch } from '../test-utils';
import type { Project } from '../api';

describe('Project editing', () => {
  it('links the customer and saves a changed project customer with matching contacts', async () => {
    const anna = { id: 'anna', name: 'Anna', role: 'Buyer', company: 'APEXA', email: 'anna@apexa.local' };
    const claire = { id: 'claire', name: 'Claire', role: 'Buyer', company: 'OMNIX', email: 'claire@omnix.local' };
    const project: Project = { id: 'project1', name: 'Nave 5', customer: 'APEXA', customerId: 'customer1', contacts: [anna], quotations: [], createdAt: '', updatedAt: '' };
    const saved = vi.fn();
    mockFetch((method, path, body) => {
      if (path === '/api/projects/contacts') return [anna, claire];
      if (method === 'PATCH') { saved(body); return project; }
      return [project];
    });
    const onUpdated = vi.fn();
    render(<ProjectsPage onError={vi.fn()} onUpdated={onUpdated} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'APEXA' }));
    expect(window.location.hash).toBe('#/customers/customer1');
    await user.click(screen.getByRole('button', { name: 'Edit project' }));
    const name = screen.getByLabelText('Project name *');
    await user.clear(name); await user.type(name, 'Nave 5 updated');
    await user.selectOptions(screen.getByLabelText('Customer *'), 'OMNIX');
    await user.click(screen.getByRole('checkbox', { name: 'Claire' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(saved).toHaveBeenCalledWith({ name: 'Nave 5 updated', customer: 'OMNIX', contactIds: ['claire'] }));
    expect(onUpdated).toHaveBeenCalled();
  });
});
