import type { PrismaClient } from '@roofops/db';
import type {
  Message as MessageDto,
  MessageChannel,
  MessageDirection,
  MessageThread as MessageThreadDto,
  SendMessageRequest,
} from '@roofops/types';
import type { AuthContext } from '../lib/auth-context.js';
import { Errors } from '../errors.js';
import { AuditLogger } from './audit.js';

interface ThreadRow {
  id: string;
  orgId: string;
  contactId: string;
  leadId: string | null;
  channel: MessageChannel;
  externalId: string | null;
  lastMessageAt: Date | null;
  unreadCount: number;
  createdAt: Date;
  updatedAt: Date;
}

interface MessageRow {
  id: string;
  orgId: string;
  threadId: string;
  direction: MessageDirection;
  channel: MessageChannel;
  body: string;
  externalId: string | null;
  status: MessageDto['status'];
  sentBy: string | null;
  attachments: unknown;
  errorMessage: string | null;
  createdAt: Date;
}

function threadToDto(row: ThreadRow): MessageThreadDto {
  return {
    id: row.id,
    orgId: row.orgId,
    contactId: row.contactId,
    leadId: row.leadId,
    channel: row.channel,
    externalId: row.externalId,
    lastMessageAt: row.lastMessageAt ? row.lastMessageAt.toISOString() : null,
    unreadCount: row.unreadCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function messageToDto(row: MessageRow): MessageDto {
  return {
    id: row.id,
    orgId: row.orgId,
    threadId: row.threadId,
    direction: row.direction,
    channel: row.channel,
    body: row.body,
    externalId: row.externalId,
    status: row.status,
    sentBy: row.sentBy,
    attachments: (row.attachments as MessageDto['attachments']) ?? null,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
  };
}

export interface MessageTransport {
  channel: MessageChannel;
  send: (input: {
    orgId: string;
    contactId: string;
    threadExternalId: string | null;
    body: string;
  }) => Promise<{ externalId: string | null }>;
}

export class MessagesService {
  private readonly transports = new Map<MessageChannel, MessageTransport>();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly audit: AuditLogger,
  ) {}

  registerTransport(transport: MessageTransport): void {
    this.transports.set(transport.channel, transport);
  }

  async listThreads(
    ctx: AuthContext,
    opts: { limit: number; cursor?: string },
  ): Promise<{ items: MessageThreadDto[]; nextCursor: string | null }> {
    const rows = await this.prisma.messageThread.findMany({
      where: { orgId: ctx.orgId },
      orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
      take: opts.limit + 1,
      ...(opts.cursor ? { skip: 1, cursor: { id: opts.cursor } } : {}),
    });
    const hasMore = rows.length > opts.limit;
    const slice = hasMore ? rows.slice(0, opts.limit) : rows;
    return {
      items: slice.map(threadToDto),
      nextCursor: hasMore ? slice[slice.length - 1]?.id ?? null : null,
    };
  }

  async listMessages(
    ctx: AuthContext,
    threadId: string,
    opts: { limit: number; cursor?: string },
  ): Promise<{ items: MessageDto[]; nextCursor: string | null }> {
    const thread = await this.prisma.messageThread.findFirst({
      where: { id: threadId, orgId: ctx.orgId },
    });
    if (!thread) throw Errors.notFound('Thread not found');
    const rows = await this.prisma.message.findMany({
      where: { orgId: ctx.orgId, threadId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: opts.limit + 1,
      ...(opts.cursor ? { skip: 1, cursor: { id: opts.cursor } } : {}),
    });
    const hasMore = rows.length > opts.limit;
    const slice = hasMore ? rows.slice(0, opts.limit) : rows;
    return {
      items: slice.map(messageToDto),
      nextCursor: hasMore ? slice[slice.length - 1]?.id ?? null : null,
    };
  }

  async send(ctx: AuthContext, req: SendMessageRequest): Promise<MessageDto> {
    let thread: ThreadRow | null = null;
    if (req.threadId) {
      thread = await this.prisma.messageThread.findFirst({
        where: { id: req.threadId, orgId: ctx.orgId },
      });
      if (!thread) throw Errors.notFound('Thread not found');
    } else {
      if (!req.contactId || !req.channel) {
        throw Errors.conflict('Either threadId or (contactId + channel) is required');
      }
      const contact = await this.prisma.contact.findFirst({
        where: { id: req.contactId, orgId: ctx.orgId, deletedAt: null },
      });
      if (!contact) throw Errors.notFound('Contact not found');
      thread = await this.prisma.messageThread.create({
        data: {
          orgId: ctx.orgId,
          contactId: req.contactId,
          channel: req.channel,
        },
      });
    }

    const transport = this.transports.get(thread.channel);
    let externalId: string | null = null;
    let status: MessageDto['status'] = 'PENDING';
    let errorMessage: string | null = null;

    if (transport) {
      try {
        const result = await transport.send({
          orgId: ctx.orgId,
          contactId: thread.contactId,
          threadExternalId: thread.externalId,
          body: req.body,
        });
        externalId = result.externalId;
        status = 'SENT';
      } catch (err) {
        status = 'FAILED';
        errorMessage = err instanceof Error ? err.message : String(err);
      }
    } else {
      // No transport registered yet — record the message as PENDING so it
      // surfaces in the UI; outbound channel adapters land in Chunk 4.
      status = 'PENDING';
    }

    const created = await this.prisma.message.create({
      data: {
        orgId: ctx.orgId,
        threadId: thread.id,
        direction: 'OUTBOUND',
        channel: thread.channel,
        body: req.body,
        externalId,
        status,
        sentBy: ctx.userId,
        attachments: (req.attachments ?? null) as never,
        errorMessage,
      },
    });

    await this.prisma.messageThread.update({
      where: { id: thread.id },
      data: { lastMessageAt: created.createdAt },
    });

    await this.prisma.activity.create({
      data: {
        orgId: ctx.orgId,
        kind: 'MESSAGE_OUTBOUND',
        threadId: thread.id,
        messageId: created.id,
        contactId: thread.contactId,
        actorId: ctx.userId,
        payload: { channel: thread.channel, status },
      },
    });
    await this.audit.log(ctx, {
      action: 'message.sent',
      entityType: 'Message',
      entityId: created.id,
      after: { threadId: thread.id, status },
    });
    return messageToDto(created);
  }

  // Called by channel adapters when an inbound message arrives.
  async recordInbound(
    ctx: AuthContext,
    input: {
      contactId: string;
      channel: MessageChannel;
      body: string;
      externalThreadId?: string;
      externalMessageId?: string;
      leadId?: string | null;
    },
  ): Promise<{ thread: MessageThreadDto; message: MessageDto }> {
    const thread =
      (input.externalThreadId
        ? await this.prisma.messageThread.findUnique({
            where: {
              orgId_channel_externalId: {
                orgId: ctx.orgId,
                channel: input.channel,
                externalId: input.externalThreadId,
              },
            },
          })
        : null) ??
      (await this.prisma.messageThread.create({
        data: {
          orgId: ctx.orgId,
          contactId: input.contactId,
          channel: input.channel,
          externalId: input.externalThreadId ?? null,
          leadId: input.leadId ?? null,
        },
      }));

    const message = await this.prisma.message.create({
      data: {
        orgId: ctx.orgId,
        threadId: thread.id,
        direction: 'INBOUND',
        channel: input.channel,
        body: input.body,
        externalId: input.externalMessageId ?? null,
        status: 'DELIVERED',
      },
    });

    await this.prisma.messageThread.update({
      where: { id: thread.id },
      data: {
        lastMessageAt: message.createdAt,
        unreadCount: { increment: 1 },
      },
    });

    await this.prisma.activity.create({
      data: {
        orgId: ctx.orgId,
        kind: 'MESSAGE_INBOUND',
        threadId: thread.id,
        messageId: message.id,
        contactId: input.contactId,
        leadId: input.leadId ?? null,
        payload: { channel: input.channel },
      },
    });

    return {
      thread: threadToDto({ ...thread, lastMessageAt: message.createdAt, unreadCount: thread.unreadCount + 1 }),
      message: messageToDto(message),
    };
  }
}
