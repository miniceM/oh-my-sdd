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

function delegatedCandidates(name, home, projectRoot) {
  return [
    path.join(home, '.config', 'opencode', 'skills', name, 'SKILL.md'),
    path.join(projectRoot, '.opencode', 'skills', name, 'SKILL.md'),
    path.join(projectRoot, 'skills', name, 'SKILL.md'),
    path.join(projectRoot, '.agents', 'skills', name, 'SKILL.md'),
    path.join(home, '.agents', 'skills', name, 'SKILL.md'),
    path.join(projectRoot, '.claude', 'skills', name, 'SKILL.md'),
    path.join(home, '.claude', 'skills', name, 'SKILL.md'),
  ];
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
  const references = [...new Set(`${command}\n${mainSkill}`.match(/superpowers:[a-z0-9-]+/g) ?? [])];
  const brainstormingRef = references.find((name) => name.endsWith(':brainstorming'));
  const writingPlansRef = references.find((name) => name.endsWith(':writing-plans'));
  if (!brainstormingRef || !writingPlansRef) {
    throw new Error('sdd-plan skill does not declare the required delegation chain');
  }

  const brainstorming = delegatedName(brainstormingRef);
  const writingPlans = delegatedName(writingPlansRef);
  const events = ['main-skill-loaded'];
  const brainstormingPath = delegatedCandidates(brainstorming, home, projectRoot)
    .find((candidate) => fs.existsSync(candidate));

  if (brainstormingPath) {
    const content = fs.readFileSync(brainstormingPath, 'utf8');
    if (!content.includes('writing-plans')) {
      throw new Error('brainstorming skill does not chain to writing-plans');
    }
  } else {
    if (!command.includes('inline-content-resolution')) {
      throw new Error('delegated skill missing and command has no inline fallback');
    }
    events.push('inline-content-resolution');
  }

  events.push('brainstorming-question', 'brainstorming-approval-requested');
  if (approved) {
    events.push('brainstorming-approved');
    const writingPlansPath = firstExisting(delegatedCandidates(writingPlans, home, projectRoot));
    fs.readFileSync(writingPlansPath, 'utf8');
    events.push('writing-plans-started');
  }

  return {
    events,
    delegatedSkills: { brainstorming, writingPlans },
  };
}
