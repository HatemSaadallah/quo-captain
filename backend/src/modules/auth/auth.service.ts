import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AuthUser, JwtPayload, LoginResponse } from '../../common/interfaces/auth.interface';
import { verifyPassword } from '../../common/utils/password';
import { toAuthUser, UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string): Promise<LoginResponse> {
    if (typeof email !== 'string' || typeof password !== 'string') throw new UnauthorizedException('Invalid credentials');
    const u = await this.users.findByEmail(email);
    if (!u || !verifyPassword(password, u.passwordHash)) throw new UnauthorizedException('Invalid credentials');
    const user = toAuthUser(u);
    const payload: JwtPayload = { sub: user.id, email: user.email, name: user.name, role: user.role };
    return { token: await this.jwt.signAsync(payload), user };
  }

  async verify(token: string): Promise<AuthUser> {
    try {
      const p = await this.jwt.verifyAsync<JwtPayload>(token);
      return { id: p.sub, email: p.email, name: p.name, role: p.role };
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
