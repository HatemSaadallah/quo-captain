export type UserRole = 'estimator' | 'admin';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

export interface JwtPayload {
  sub: string;
  email: string;
  name: string;
  role: UserRole;
}
