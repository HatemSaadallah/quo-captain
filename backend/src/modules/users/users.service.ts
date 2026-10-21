import { ConflictException, Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import type { AuthUser, UserRole } from '../../common/interfaces/auth.interface';
import { hashPassword } from '../../common/utils/password';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateUserInput {
  email: string;
  name: string;
  password: string;
  role?: UserRole;
}

export function toAuthUser(u: User): AuthUser {
  return { id: u.id, email: u.email, name: u.name, role: u.role as UserRole };
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async create(input: CreateUserInput): Promise<AuthUser> {
    const email = input.email.trim().toLowerCase();
    if (await this.findByEmail(email)) throw new ConflictException(`User ${email} already exists`);
    const u = await this.prisma.user.create({ data: { email, name: input.name.trim(), passwordHash: hashPassword(input.password), role: input.role ?? 'salesperson' } });
    return toAuthUser(u);
  }
}
