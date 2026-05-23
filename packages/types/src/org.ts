import { z } from 'zod';

export const RoleSchema = z.enum(['OWNER', 'ADMIN', 'MEMBER']);
export type Role = z.infer<typeof RoleSchema>;

export const OrgSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  createdAt: z.string().datetime(),
});
export type Org = z.infer<typeof OrgSchema>;

export const MembershipSchema = z.object({
  userId: z.string().uuid(),
  orgId: z.string().uuid(),
  role: RoleSchema,
  createdAt: z.string().datetime(),
});
export type Membership = z.infer<typeof MembershipSchema>;
