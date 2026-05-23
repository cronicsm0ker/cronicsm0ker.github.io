import { describe, expect, it } from 'vitest';
import { LEAD_STAGE_TRANSITIONS, type LeadStage } from './lead.js';

describe('LEAD_STAGE_TRANSITIONS', () => {
  const allStages: LeadStage[] = [
    'NEW',
    'CONTACTED',
    'QUALIFIED',
    'ESTIMATING',
    'PROPOSAL_SENT',
    'WON',
    'LOST',
    'DORMANT',
  ];

  it('defines transitions for every stage', () => {
    for (const stage of allStages) {
      expect(LEAD_STAGE_TRANSITIONS[stage]).toBeDefined();
    }
  });

  it('never transitions to the same stage', () => {
    for (const stage of allStages) {
      expect(LEAD_STAGE_TRANSITIONS[stage]).not.toContain(stage);
    }
  });

  it('lets terminal stages reopen', () => {
    expect(LEAD_STAGE_TRANSITIONS.LOST).toContain('NEW');
    expect(LEAD_STAGE_TRANSITIONS.DORMANT).toContain('NEW');
    expect(LEAD_STAGE_TRANSITIONS.WON).toContain('PROPOSAL_SENT');
  });

  it('blocks skipping the proposal stage from QUALIFIED to WON', () => {
    expect(LEAD_STAGE_TRANSITIONS.QUALIFIED).not.toContain('WON');
  });
});
