import { Logger, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';

const secret = process.env.JWT_SECRET ?? 'somec-dev-secret-change-me';
if (!process.env.JWT_SECRET) new Logger('AuthModule').warn('JWT_SECRET not set, using the development secret');
/** Token lifetime in seconds (default 12 h). */
const expiresIn = Number(process.env.JWT_EXPIRES_IN_SECONDS ?? 12 * 3600);

@Module({
  imports: [UsersModule, JwtModule.register({ secret, signOptions: { expiresIn } })],
  controllers: [AuthController],
  providers: [AuthService, { provide: APP_GUARD, useClass: AuthGuard }],
  exports: [AuthService],
})
export class AuthModule {}
