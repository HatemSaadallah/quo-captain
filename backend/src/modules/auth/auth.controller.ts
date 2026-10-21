import { Body, Controller, Get, Post } from '@nestjs/common';
import type { AuthUser, LoginDto, LoginResponse } from '../../common/interfaces/auth.interface';
import { CurrentUser, Public } from './auth.decorators';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() body: LoginDto): Promise<LoginResponse> {
    return this.auth.login(body?.email, body?.password);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }
}
