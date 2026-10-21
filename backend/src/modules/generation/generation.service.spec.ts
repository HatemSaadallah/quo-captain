import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { OUTPUT_DIR } from '../../common/utils/paths';
import type { CatalogService } from '../catalog/catalog.service';
import type { ProjectsService } from '../projects/projects.service';
import { GenerationService } from './generation.service';

const folderA='REVIEW_OWNER_A_'+randomUUID();
const folderB='REVIEW_OWNER_B_'+randomUUID();
const file='Analysis.xlsx';
const filesOf=(folder:string):string[]=>[path.join(folder,file),path.join(folder,'validation_report.json')];
const projects={generationFiles:vi.fn(async(userId:string):Promise<string[]>=>userId==='A'?filesOf(folderA):userId==='B'?filesOf(folderB):[])};
const service=new GenerationService(projects as unknown as ProjectsService, {} as CatalogService);
beforeAll(()=>{
 for(const folder of [folderA,folderB]){
  mkdirSync(path.join(OUTPUT_DIR,folder),{recursive:true});
  writeFileSync(path.join(OUTPUT_DIR,folder,file),'test-only workbook placeholder');
  writeFileSync(path.join(OUTPUT_DIR,folder,'validation_report.json'),JSON.stringify({projectId:folder,status:'requires_review'}));
 }
});
afterAll(()=>{for(const folder of [folderA,folderB]) rmSync(path.join(OUTPUT_DIR,folder),{recursive:true,force:true});});

describe('output ownership',()=>{
 it('lists only each authenticated owner outputs',async()=>{
  expect((await service.listOutputs('A')).map(r=>r.folder)).toEqual([folderA,folderA]);
  expect((await service.listOutputs('B')).map(r=>r.folder)).toEqual([folderB,folderB]);
  expect(await service.listOutputs('other')).toEqual([]);
 });
 it('allows owner downloads but rejects another owner guessed workbook and report paths',async()=>{
  expect(await service.resolveOutput(folderA,file,'A')).toBe(path.join(OUTPUT_DIR,folderA,file));
  await expect(service.resolveOutput(folderA,file,'B')).rejects.toMatchObject({status:404});
  await expect(service.resolveOutput(folderA,'validation_report.json','B')).rejects.toMatchObject({status:404});
 });
 it('authorizes the report endpoint through the same owner check',async()=>{
  expect((await service.readReport(folderA,'A')).projectId).toBe(folderA);
  await expect(service.readReport(folderA,'B')).rejects.toMatchObject({status:404});
 });
 it('rejects traversal even for authenticated owners',async()=>{
  await expect(service.resolveOutput('..',file,'A')).rejects.toMatchObject({status:400});
  await expect(service.resolveOutput(folderA,'../Analysis.xlsx','A')).rejects.toMatchObject({status:400});
 });
});
