import fs from 'node:fs';
import path from 'node:path';

function expandCandidate(candidate, home, projectRoot) {
  if (candidate.startsWith('~/')) return path.join(home, candidate.slice(2));
  return path.resolve(projectRoot, candidate);
}

function firstExisting(candidates) {
  const selected = candidates.find((candidate) => fs.existsSync(candidate));
  if (!selected) throw new Error(`No skill content found in: ${candidates.join(', ')}`);
  return selected;
}

function parseMainSkillCandidates(command, home, projectRoot) {
  const candidates = [...command.matchAll(/`([^`]*skills\/sdd-plan\/SKILL\.md)`/g)]
    .map((match) => expandCandidate(match[1], home, projectRoot));
  if (candidates.length === 0) throw new Error('/sdd-plan command has no main skill contract');
  return candidates;
}

function delegatedName(reference) {
  return reference.includes(':') ? reference.slice(reference.indexOf(':') + 1) : reference;
}

function parseDelegatedTemplates(command) {
  const contract = command.match(
    /2\. Read the first existing `SKILL\.md` from([\s\S]*?)3\. If no file exists/,
  )?.[1];
  const templates = [...(contract?.matchAll(/`([^`]*<name-without-namespace>[^`]*)`/g) ?? [])]
    .map((match) => match[1]);
  if (templates.length === 0) throw new Error('/sdd-plan command has no delegated resolver paths');
  return templates;
}

function delegatedCandidates(templates, name, home, projectRoot) {
  return templates.map((template) => {
    const candidate = template.replace('<name-without-namespace>', name);
    return path.join(expandCandidate(candidate, home, projectRoot), 'SKILL.md');
  });
}

function resolveDelegated(requested, templates, command, home, projectRoot) {
  const normalized = delegatedName(requested);
  const source = delegatedCandidates(templates, normalized, home, projectRoot)
    .find((candidate) => fs.existsSync(candidate)) ?? null;
  if (!source && !command.includes('inline-content-resolution')) {
    throw new Error(`delegated skill ${requested} is missing and command has no inline fallback`);
  }
  return {
    requested,
    normalized,
    source,
    mode: source ? 'skill-file' : 'inline-content-resolution',
  };
}

function assertMainSkillSemantics(mainSkill) {
  const question = mainSkill.includes('问问题');
  const approval = /用户\s+approve/.test(mainSkill);
  const chainedSkill = mainSkill.match(/自动\s+chain\s+([a-z0-9-]+)/)?.[1];
  if (!question) {
    throw new Error('sdd-plan main skill missing brainstorming question semantics');
  }
  if (!approval) {
    throw new Error('sdd-plan main skill missing brainstorming approval semantics');
  }
  if (!chainedSkill) {
    throw new Error('sdd-plan main skill missing writing-plans chain semantics');
  }
  return { question, approval, chainedSkill };
}

/**
 * Execute the published `/sdd-plan` content-resolution contract deterministically.
 * This test harness models user approval, but does not invoke a model or tool host.
 */
export function runSddPlanHarness({ home, approved, projectRoot = home }) {
  const commandPath = path.join(home, '.config', 'opencode', 'commands', 'sdd-plan.md');
  const command = fs.readFileSync(commandPath, 'utf8');
  const mainSkillPath = firstExisting(parseMainSkillCandidates(command, home, projectRoot));
  const mainSkill = fs.readFileSync(mainSkillPath, 'utf8');
  const semantics = assertMainSkillSemantics(mainSkill);
  const templates = parseDelegatedTemplates(command);
  const brainstormingRef = mainSkill.match(/调用 \*\*`(superpowers:brainstorming)`\*\*/)?.[1];
  if (!brainstormingRef) throw new Error('sdd-plan skill does not declare brainstorming delegation');

  const brainstorming = delegatedName(brainstormingRef);
  const events = ['main-skill-loaded'];
  const resolutions = [
    resolveDelegated(brainstormingRef, templates, command, home, projectRoot),
  ];
  const brainstormingPath = resolutions[0].source;

  if (brainstormingPath) {
    const content = fs.readFileSync(brainstormingPath, 'utf8');
    if (!content.includes('writing-plans')) {
      throw new Error('brainstorming skill does not chain to writing-plans');
    }
  } else {
    events.push('inline-content-resolution');
  }

  if (semantics.question) events.push('brainstorming-question');
  if (semantics.approval) events.push('brainstorming-approval-requested');
  if (approved) {
    events.push('brainstorming-approved');
    const namespace = brainstormingRef.split(':')[0];
    const writingPlansRef = `${namespace}:${semantics.chainedSkill}`;
    const writingResolution = resolveDelegated(
      writingPlansRef, templates, command, home, projectRoot,
    );
    resolutions.push(writingResolution);
    if (writingResolution.source) fs.readFileSync(writingResolution.source, 'utf8');
    else events.push('inline-content-resolution');
    events.push('writing-plans-started');
  }

  return {
    events,
    delegatedSkills: { brainstorming, writingPlans: semantics.chainedSkill },
    resolutions,
  };
}
