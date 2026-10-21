import { describe, it, expect } from 'vitest';
import { generationStatus } from './validator';

describe('overall workbook validation status', () => {
  it('keeps unresolved external inputs under review after successful recalculation', () => {
    expect(generationStatus([{level:'ok',check:'totals',detail:'reconciled'},{level:'warning',check:'external-links',detail:'missing budget workbook'}],true)).toBe('requires_review');
  });
  it('keeps inherited or replacement summary errors under review', () => {
    expect(generationStatus([{level:'warning',check:'errors',detail:'10 unresolved error cells; 10 in source'}],true)).toBe('requires_review');
  });
  it('requires recalculation and no unresolved checks before validation', () => {
    expect(generationStatus([],false)).toBe('requires_review');
    expect(generationStatus([{level:'ok',check:'totals',detail:'reconciled'}],true)).toBe('validated');
  });
  it('fails structurally invalid workbooks', () => {
    expect(generationStatus([{level:'error',check:'sheet',detail:'missing sheet'}],true)).toBe('failed');
  });
});
