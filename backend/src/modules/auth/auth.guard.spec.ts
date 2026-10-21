import { describe, expect, it, vi } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from './auth.decorators';
import type { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';

const user={id:'A',email:'test@example.test',name:'Tester',role:'estimator' as const};
function context(req:Partial<AuthenticatedRequest>):ExecutionContext {
  return {getHandler:()=>function handler(){},getClass:()=>class TestController{},switchToHttp:()=>({getRequest:()=>req})} as unknown as ExecutionContext;
}
describe('bearer authentication boundary',()=>{
 it('does not accept reusable tokens from URLs',async()=>{
  const auth={verify:vi.fn().mockResolvedValue(user)};
  const guard=new AuthGuard(auth as unknown as AuthService,new Reflector());
  await expect(guard.canActivate(context({headers:{},query:{token:'valid-looking-token'}}))).rejects.toMatchObject({status:401});
  expect(auth.verify).not.toHaveBeenCalled();
 });
 it('continues to authenticate normal Authorization headers',async()=>{
  const auth={verify:vi.fn().mockResolvedValue(user)};
  const guard=new AuthGuard(auth as unknown as AuthService,new Reflector());
  const req:Partial<AuthenticatedRequest>={headers:{authorization:'Bearer valid-token'},query:{}};
  expect(await guard.canActivate(context(req))).toBe(true);
  expect(auth.verify).toHaveBeenCalledWith('valid-token');expect(req.user).toEqual(user);
 });
});
