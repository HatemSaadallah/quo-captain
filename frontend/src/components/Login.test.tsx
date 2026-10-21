import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Login } from './Login';
import { mockFetch } from '../test-utils';
import { getToken } from '../api';

describe('Login', () => {
  it('signs in, stores the token and reports the user', async () => {
    const fetch = mockFetch((method, path, body) => {
      expect(method).toBe('POST');
      expect(path).toBe('/api/auth/login');
      expect(body).toEqual({ email: 'estimator@somec.local', password: 'somec2026' });
      return { token: 'jwt-123', user: { id: 'u1', email: 'estimator@somec.local', name: 'Mock Estimator', role: 'salesman' } };
    });
    const onLogin = vi.fn();
    render(<Login onLogin={onLogin} />);
    await userEvent.type(screen.getByLabelText(/password/i), 'somec2026');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(onLogin).toHaveBeenCalledWith(expect.objectContaining({ name: 'Mock Estimator' }));
    expect(getToken()).toBe('jwt-123');
  });

  it('shows the server error on bad credentials', async () => {
    mockFetch(() => ({ status: 401, body: { message: 'Invalid credentials', statusCode: 401 } }));
    const onLogin = vi.fn();
    render(<Login onLogin={onLogin} />);
    await userEvent.type(screen.getByLabelText(/password/i), 'wrong-one');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid credentials');
    expect(onLogin).not.toHaveBeenCalled();
    expect(getToken()).toBeNull();
  });
});
