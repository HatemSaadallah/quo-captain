import { describe, expect, it, vi } from 'vitest';
import type { JwtService } from '@nestjs/jwt';
import type { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

describe('AuthService session identity', () => {
  it('uses the current database name and role for an existing token', async () => {
    const users = { findById: vi.fn().mockResolvedValue({ id: 'u1', email: 'estimator@somec.local', name: 'Mock Salesperson', role: 'salesperson' }) };
    const jwt = { verifyAsync: vi.fn().mockResolvedValue({ sub: 'u1', name: 'Mock Estimator', role: 'estimator' }) };
    const auth = new AuthService(users as unknown as UsersService, jwt as unknown as JwtService);

    await expect(auth.verify('existing-token')).resolves.toEqual({ id: 'u1', email: 'estimator@somec.local', name: 'Mock Salesperson', role: 'salesperson' });
    expect(users.findById).toHaveBeenCalledWith('u1');
  });

  it('rejects a token whose user has been removed', async () => {
    const users = { findById: vi.fn().mockResolvedValue(null) };
    const jwt = { verifyAsync: vi.fn().mockResolvedValue({ sub: 'deleted-user' }) };
    const auth = new AuthService(users as unknown as UsersService, jwt as unknown as JwtService);

    await expect(auth.verify('existing-token')).rejects.toThrow('Invalid or expired token');
  });
});
