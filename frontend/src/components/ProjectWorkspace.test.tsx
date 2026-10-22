import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProjectFinder } from './ProjectFinder';
import { ProjectWorkspace } from './ProjectWorkspace';
import { mockFetch, quotation, item } from '../test-utils';
import type { Project, ProjectMessage } from '../api';

const source = quotation([item({ id: 'balcony', description: 'Glass balcony' }), item({ id: 'jacuzzi', description: 'Jacuzzi windscreen' })]);
const project: Project = { id: 'project1', name: 'Nave 17', customer: 'APEXA', customerId: 'c1', contacts: [], quotations: [source], brief: '', createdAt: '', updatedAt: '' };
const proposal: ProjectMessage = { id: 'message1', role: 'assistant', mode: 'preview', content: 'Keep the balcony; exclude the jacuzzi windscreen.', proposal: { sourceQuotationId: source.id, sourceUpdatedAt: source.updatedAt, title: 'Balcony without jacuzzi', excludeItemIds: ['jacuzzi'] }, createdQuotationId: null, createdAt: '2026-10-21T10:00:00Z' };

describe('Project search and workspace', () => {
  it('finds and opens an actual project, clearly labelling preview results', async () => {
    mockFetch((_method, path) => path === '/api/projects/search' ? { reply: 'Found the balcony project.', projectIds: ['project1'], mode: 'preview' } : [project]);
    render(<ProjectFinder />); const user = userEvent.setup();
    await user.type(screen.getByRole('textbox', { name: 'Search everything in plain language' }), 'last balcony for APEXA');
    await user.click(screen.getByRole('button', { name: /^Search$/ }));
    await screen.findByText('Found the balcony project.');
    expect(screen.getByText(/Preview mode/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Nave 17/ }));
    expect(window.location.hash).toBe('#/projects/project1');
  });
  it('saves a brief and reviews exact exclusions before creating a customer-linked draft', async () => {
    const save = vi.fn(); const create = vi.fn();
    mockFetch((method, path, body) => {
      if (path.endsWith('/brief')) { save(body); return { brief: 'Same balcony, no jacuzzi.' }; }
      if (path.endsWith('/draft')) { create(body); return { quotationId: 'new-draft' }; }
      if (method === 'POST') return [proposal];
      return [];
    });
    const updated = vi.fn(); render(<ProjectWorkspace project={project} projects={[project]} onUpdated={updated} />);
    const user = userEvent.setup();
    await screen.findByText('Start with what the customer needs.');
    await user.click(screen.getByRole('tab', { name: /Brief & transcript/ }));
    await user.type(screen.getByLabelText('Project brief & transcript'), 'Same balcony, no jacuzzi.');
    await user.click(screen.getByRole('button', { name: 'Save brief' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith({ brief: 'Same balcony, no jacuzzi.' }));
    await user.click(screen.getByRole('tab', { name: /Conversation/ }));
    await user.type(screen.getByRole('textbox', { name: 'Ask about this project' }), 'same without jaccuzzi');
    await user.click(screen.getByRole('button', { name: 'Send ↑' }));
    await user.click(await screen.findByRole('button', { name: 'Review new draft →' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/Jacuzzi windscreen/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Create draft quotation' })).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Reference *'), 'TM2126-01');
    await user.click(within(dialog).getByRole('button', { name: 'Create draft quotation' }));
    await waitFor(() => expect(create).toHaveBeenCalledWith({ name: 'Balcony without jacuzzi', reference: 'TM2126-01' }));
    expect(window.location.hash).toBe('#/quotations/new-draft');
    expect(updated).toHaveBeenCalled();
  });
  it('loads the saved project conversation when opening a project', async () => {
    mockFetch(() => [proposal]);
    render(<ProjectWorkspace project={project} projects={[project]} onUpdated={vi.fn()} />);
    expect(await screen.findByText(proposal.content)).toBeInTheDocument();
  });
});
