// Cross-org isolation: a user from Org A must not be able to read or write
// anything owned by Org B via the services. This is the single most
// important safety property of a multi-tenant API; if it ever regresses
// every other phase's correctness is moot.
//
// Requires a live Postgres reachable at DATABASE_URL with migrations
// applied. CI provisions this; locally see docs/setup.md for the Docker
// Postgres command.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@roofops/db';
import type { AuthContext } from '../../lib/auth-context.js';
import { ContactsService } from '../contacts.js';
import { LeadsService } from '../leads.js';
import { AuditLogger } from '../audit.js';

const hasDb = !!process.env['DATABASE_URL'];
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb('org isolation', () => {
  const prisma = new PrismaClient();
  const audit = new AuditLogger(prisma);
  const contacts = new ContactsService(prisma, audit);
  const leads = new LeadsService(prisma, audit, contacts);

  let ctxA: AuthContext;
  let ctxB: AuthContext;
  let leadInA: string;

  beforeAll(async () => {
    // Fresh orgs + sentinel users for the test run. We don't truncate
    // the whole db so devs can run repeatedly without losing other
    // fixtures; the unique-per-run org names keep this isolated.
    const stamp = `iso-${Date.now()}`;

    const orgA = await prisma.org.create({ data: { name: `${stamp}-A` } });
    const orgB = await prisma.org.create({ data: { name: `${stamp}-B` } });

    const userA = await prisma.user.create({
      data: { email: `${stamp}-a@example.test`, passwordHash: 'x' },
    });
    const userB = await prisma.user.create({
      data: { email: `${stamp}-b@example.test`, passwordHash: 'x' },
    });
    await prisma.membership.createMany({
      data: [
        { userId: userA.id, orgId: orgA.id, role: 'OWNER' },
        { userId: userB.id, orgId: orgB.id, role: 'OWNER' },
      ],
    });

    ctxA = {
      userId: userA.id,
      orgId: orgA.id,
      role: 'OWNER',
      requestId: 'test-A',
      ip: '127.0.0.1',
    };
    ctxB = {
      userId: userB.id,
      orgId: orgB.id,
      role: 'OWNER',
      requestId: 'test-B',
      ip: '127.0.0.1',
    };

    const lead = await leads.create(ctxA, {
      contact: { name: 'Org A Customer', email: `${stamp}-customer@example.test` },
      source: 'MANUAL',
    });
    leadInA = lead.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('Org B cannot read a lead created in Org A', async () => {
    await expect(leads.findById(ctxB, leadInA)).rejects.toThrow(/not found/i);
  });

  it('Org B leads list does not include Org A leads', async () => {
    const result = await leads.list(ctxB, { limit: 100 });
    expect(result.items.find((l) => l.id === leadInA)).toBeUndefined();
  });

  it('Org B cannot change stage on an Org A lead', async () => {
    await expect(
      leads.changeStage(ctxB, leadInA, { stage: 'WON' }),
    ).rejects.toThrow(/not found/i);
  });

  it('Org B cannot assign an Org A lead', async () => {
    await expect(
      leads.assign(ctxB, leadInA, { ownerId: ctxB.userId }),
    ).rejects.toThrow(/not found/i);
  });

  it('Contacts dedup is scoped per org (same email creates separate contacts)', async () => {
    const sharedEmail = `shared-${Date.now()}@example.test`;
    const a = await contacts.findOrCreate(ctxA, { name: 'A copy', email: sharedEmail });
    const b = await contacts.findOrCreate(ctxB, { name: 'B copy', email: sharedEmail });
    expect(a.contact.id).not.toBe(b.contact.id);
    expect(a.created).toBe(true);
    expect(b.created).toBe(true);
  });
});
