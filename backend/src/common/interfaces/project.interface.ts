import type { Quotation } from './quotation.interface';

export interface Project {
  id: string;
  name: string;
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
