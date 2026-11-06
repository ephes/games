import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';

const workflow = parse(
  readFileSync('../.github/workflows/deploy-platformer.yml', 'utf8')
);

describe('Platformer quality workflow', () => {
  it('checks pull requests and main pushes with read-only permissions', () => {
    expect(workflow.on).toHaveProperty('pull_request');
    expect(workflow.on.push.branches).toContain('main');
    expect(workflow.permissions).toEqual({ contents: 'read' });
    expect(workflow.jobs.build.permissions).toBeUndefined();
    const steps = workflow.jobs.build.steps;
    expect(
      steps.find(step => step.uses?.startsWith('actions/setup-node@')).with[
        'node-version-file'
      ]
    ).toBe('platformer_js/.node-version');
    for (const command of [
      'npm ci',
      'npm run lint',
      'npm run format:check',
      'npm run test:run',
      'npm run build',
      'npm run build:docs'
    ]) {
      const step = steps.find(step => step.run === command);
      expect(step).toBeDefined();
      expect(step.if).toBeUndefined();
      expect(step['continue-on-error']).toBeUndefined();
    }
    expect(workflow.jobs.build['continue-on-error']).toBeUndefined();
  });

  it('permits publication only on an explicit manual request', () => {
    expect(workflow.on.workflow_dispatch.inputs.publish.default).toBe(false);
    const guard = "github.event_name == 'workflow_dispatch' && inputs.publish";
    expect(workflow.jobs.deploy.if).toBe(guard);
    expect(workflow.jobs.deploy.needs).toBe('build');
    for (const step of workflow.jobs.build.steps.filter(
      step =>
        step.uses?.includes('pages') ||
        step.name === 'Prepare deployment directory'
    )) {
      expect(step.if).toBe(guard);
    }
    expect(workflow.jobs.deploy.permissions).toEqual({
      pages: 'write',
      'id-token': 'write'
    });
  });
});
