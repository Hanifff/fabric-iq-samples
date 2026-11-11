import { describe, expect, it } from 'vitest';

import { memoryBackend } from '../ops/backend';
import { anchorFor, createOps, hasPending, inDays, isLate } from '../ops/logic';
import seed from '../ops/seed.json';
import { categories, equipmentStatuses, frequencies, healthLevels, phases, severities, SITES, siteByCode } from '../ops/types';
import { buildModel } from '../three/models';
import { isModelKey, MODELS } from '../three/slots';

describe('operations sample data', () => {
  it('places every equipment tag on a part of its site model, once per site', () => {
    const seen = new Set<string>();
    for (const item of seed.equipment) {
      const site = siteByCode(item.siteCode);
      expect(site, item.siteCode).toBeTruthy();
      expect(isModelKey(site!.model)).toBe(true);
      expect(MODELS[site!.model as keyof typeof MODELS].slots[item.slot], `${item.siteCode} ${item.slot}`).toBeTruthy();
      expect(equipmentStatuses).toContain(item.status);
      if (item.health) expect(healthLevels).toContain(item.health);
      const key = `${item.siteCode}/${item.tag}`;
      expect(seen.has(key), key).toBe(false);
      seen.add(key);
    }
  });

  it('pins every finding on a model part of an existing site', () => {
    for (const finding of seed.findings) {
      expect(anchorFor(finding.siteCode, finding.slot), finding.title).toBeTruthy();
      expect(severities).toContain(finding.severity);
    }
    const titles = seed.findings.map((finding) => `${finding.siteCode}/${finding.title}`);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('links processing control, change requests and sites consistently', () => {
    const projects = seed.controls.map((c) => c.project);
    expect(new Set(projects).size).toBe(projects.length);
    for (const control of seed.controls) {
      expect(phases).toContain(control.phase);
      expect(frequencies).toContain(control.frequency);
      if (control.site) expect(siteByCode(control.site)?.project).toBe(control.project);
    }
    for (const change of seed.changes) {
      expect(projects).toContain(change.project);
      expect(categories).toContain(change.category);
    }
    expect(SITES.filter((site) => site.project).every((site) => projects.includes(site.project!))).toBe(true);
  });

  it('builds every 3D model with all its parts', () => {
    for (const key of Object.keys(MODELS)) {
      const built = buildModel(key as keyof typeof MODELS);
      for (const slot of Object.keys(MODELS[key as keyof typeof MODELS].slots)) expect(built.parts.has(slot), `${key}/${slot}`).toBe(true);
    }
  });

  it('gives every yard a part behind plan for the 4D view', () => {
    for (const yard of SITES.filter((site) => site.kind === 'Fabrication yard')) {
      const late = seed.equipment.filter((e) => e.siteCode === yard.code && e.progress < 100 && e.plannedInDays < 0);
      expect(late.length, yard.code).toBe(1);
    }
  });
});

describe('plan status', () => {
  it('calls a part late only when its planned date has passed and it is not finished', () => {
    expect(isLate({ progress: 60, plannedDate: inDays(-1) })).toBe(true);
    expect(isLate({ progress: 100, plannedDate: inDays(-1) })).toBe(false);
    expect(isLate({ progress: 60, plannedDate: inDays(0) })).toBe(false);
    expect(isLate({ progress: 60, plannedDate: undefined })).toBe(false);
  });
});

describe('operations rules', () => {
  it('loads sample data once, without duplicates', async () => {
    const ops = createOps(memoryBackend(), []);
    await ops.seedAll();
    const first = await ops.load();
    await ops.seedAll();
    const second = await ops.load();
    expect(first.equipment.length).toBe(seed.equipment.length);
    expect(second.equipment.length).toBe(first.equipment.length);
    expect(second.findings.length).toBe(seed.findings.length);
    expect(second.changes.length).toBe(seed.changes.length);
    expect(second.controls.length).toBe(seed.controls.length);
  });

  it('needs a second person to approve a request (four-eyes)', async () => {
    const user = { id: 'planner-id', email: 'planner@contoso.example' };
    const ops = createOps(memoryBackend(user), []);
    await ops.seedAll();
    let data = await ops.load();
    const control = data.controls.find((c) => c.approvalStatus === 'Approved' && c.includeInPush)!;
    await ops.requestChange(control, { includeInPush: false }, data.requests);
    data = await ops.load();
    const request = data.requests[0];
    expect(hasPending(data.controls.find((c) => c.id === control.id)!, data.requests)).toBe(true);
    await expect(ops.decide(request, 'Approved')).rejects.toThrow('Someone else has to approve your request.');
    await expect(ops.requestChange(control, { frequency: 'Monthly' }, data.requests)).rejects.toThrow('already has a pending request');

    user.email = 'approver@contoso.example';
    await ops.decide(request, 'Approved');
    data = await ops.load();
    expect(data.controls.find((c) => c.id === control.id)?.includeInPush).toBe(false);
    expect(data.requests[0].status).toBe('Approved');
  });

  it('validates condition, findings and change requests', async () => {
    const ops = createOps(memoryBackend(), []);
    await ops.seedAll();
    const data = await ops.load();
    await expect(ops.updateEquipment(data.equipment[0], { progress: 140 })).rejects.toThrow('Progress');
    await expect(ops.createFinding({ siteCode: 'SOL45', x: Number.NaN, y: 0, z: 0, title: 'x', severity: 'Watch' })).rejects.toThrow('Pick a point');
    await expect(ops.createChange({ project: 'CON-2610', title: 'T', description: 'D', category: 'Milestone change', currentDate: new Date() }))
      .rejects.toThrow('both the current and the proposed date');
  });
});
