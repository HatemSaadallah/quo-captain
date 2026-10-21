import type { Quotation } from './quotation.interface';

export interface Project {
  id: string;
  name: string;
  brief?: string;
  customerId: string;
  customer: string;
  quotations: Quotation[];
  contacts: ProjectContact[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectDto {
  name: string;
  customer: string;
  contactIds: string[];
}

export interface ProjectContact {
  id: string;
  name: string;
  role: string;
  company: string;
  email: string;
}

export interface ProjectRevision {
  sourceQuotationId: string;
  sourceUpdatedAt: string;
  title: string;
  excludeItemIds: string[];
}
export interface ProjectMessage {
  id: string;
  role: 'user' | 'assistant';
  mode?: 'llm' | 'preview';
  content: string;
  proposal: ProjectRevision | null;
  createdQuotationId: string | null;
  createdAt: string;
}
export interface ProjectSearchResult { reply: string; projectIds: string[]; mode?: 'llm' | 'preview' }
