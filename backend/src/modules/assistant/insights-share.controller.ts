import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { AuthUser } from '../../common/interfaces/auth.interface';
import { DATA_DIR } from '../../common/utils/paths';
import { CurrentUser, Public } from '../auth/auth.decorators';

export interface InsightSnapshot {
  id: string;
  createdAt: string;
  author: string;
  question: string;
  answer: string;
  queries: string[];
  chart: { columns: string[]; rows: Array<Record<string, string | number | null>>; query: string; chart: 'bar' | 'line' | 'pie' | 'histogram' | null } | null;
}

/** MVP store: immutable snapshots in a git-ignored JSON file, newest first, capped. */
const FILE = path.join(DATA_DIR, 'insights', 'shares.json');
const read = (): InsightSnapshot[] => (existsSync(FILE) ? (JSON.parse(readFileSync(FILE, 'utf8')) as InsightSnapshot[]) : []);

@Controller('insights')
export class InsightsShareController {
  /** Freeze one assistant answer and return an unguessable id for its link. */
  @Post('share')
  share(@Body() body: Partial<InsightSnapshot>, @CurrentUser() user: AuthUser): { id: string } {
    const answer = typeof body.answer === 'string' ? body.answer.trim() : '';
    if (!answer) throw new BadRequestException('Nothing to share');
    const chart = body.chart && Array.isArray(body.chart.rows) ? { ...body.chart, rows: body.chart.rows.slice(0, 200) } : null;
    const snap: InsightSnapshot = {
      id: randomBytes(16).toString('base64url'),
      createdAt: new Date().toISOString(),
      author: user.name,
      question: String(body.question ?? '').slice(0, 2000),
      answer: answer.slice(0, 12000),
      queries: (Array.isArray(body.queries) ? body.queries : []).map(String).slice(0, 10),
      chart,
    };
    mkdirSync(path.dirname(FILE), { recursive: true });
    writeFileSync(FILE, JSON.stringify([snap, ...read()].slice(0, 1000)));
    return { id: snap.id };
  }

  /** Read-only snapshot for anyone holding the link. */
  @Public()
  @Get('shared/:id')
  shared(@Param('id') id: string): InsightSnapshot {
    const snap = /^[A-Za-z0-9_-]{16,40}$/.test(id) ? read().find((s) => s.id === id) : undefined;
    // ponytail: fixed 30-day expiry, no revoke UI; add a DELETE route if links must be withdrawn early.
    if (!snap || Date.now() - Date.parse(snap.createdAt) > 30 * 864e5) throw new NotFoundException('This shared insight has expired or does not exist.');
    return snap;
  }
}
