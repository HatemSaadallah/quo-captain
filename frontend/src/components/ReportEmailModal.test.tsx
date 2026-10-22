import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReportEmailModal } from './ReportEmailModal';
import { mockFetch, quotation } from '../test-utils';
import { api } from '../api';
import { QuotationPage } from './QuotationPage';

vi.mock('./ElencoCosti', () => ({ ElencoCosti: () => <div>Items & costs</div> }));

describe('Report emails', () => {
  it('selects customer contacts, offers templates and opens an editable mail draft without sending', async () => {
    mockFetch(() => [{ id: 'anna', name: 'Anna', company: 'APEXA', role: 'Buyer', email: 'anna@apexa.local' }, { id: 'claire', name: 'Claire', company: 'OMNIX', role: 'Buyer', email: 'claire@omnix.local' }]);
    render(<ReportEmailModal quotation={quotation()} reportName="cost-report.pdf" onClose={vi.fn()} />);
    const user = userEvent.setup();
    const recipient = await screen.findByRole('checkbox', { name: /Anna/ });
    expect(recipient).toBeChecked(); expect(screen.queryByText('Claire')).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Email template'), 'prices');
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toContain('estimated costs, not selling prices');
    const link = screen.getByRole('link', { name: 'Open email draft ↗' });
    expect(link.getAttribute('href')).toContain('mailto:anna%40apexa.local?subject=');
    expect(decodeURIComponent(link.getAttribute('href')!)).toContain('Attach the downloaded report before sending.');
    await user.click(recipient);
    expect(link).toHaveAttribute('aria-disabled', 'true'); expect(link).not.toHaveAttribute('href');
    await user.click(screen.getByRole('checkbox', { name: 'Show all directory contacts' }));
    expect(screen.getByRole('checkbox', { name: /Claire/ })).not.toBeChecked();
  });
  it('offers the email composer after a report download succeeds', async () => {
    mockFetch(() => []);
    const download = vi.spyOn(api, 'downloadPdf').mockResolvedValue(undefined);
    const q = quotation();
    render(<QuotationPage quotation={q} isCart={false} onMakeCart={vi.fn()} onConfirmed={vi.fn()} facets={null} tab="elenco" onQuotation={vi.fn()} onError={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(download).toHaveBeenCalledWith(q.id, q.reference);
    expect(screen.getByText(`${q.reference} ELENCO COSTI.pdf`)).toBeInTheDocument();
  });
});
