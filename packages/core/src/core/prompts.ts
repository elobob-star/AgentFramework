/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import process from 'node:process';
import { isGitRepository } from '../utils/gitUtils.js';
import { GEMINI_CONFIG_DIR } from '../tools/memoryTool.js';

export function resolvePathFromEnv(envVar?: string): {
  isSwitch: boolean;
  value: string | null;
  isDisabled: boolean;
} {
  // Handle the case where the environment variable is not set, empty, or just whitespace.
  const trimmedEnvVar = envVar?.trim();
  if (!trimmedEnvVar) {
    return { isSwitch: false, value: null, isDisabled: false };
  }

  const lowerEnvVar = trimmedEnvVar.toLowerCase();
  // Check if the input is a common boolean-like string.
  if (['0', 'false', '1', 'true'].includes(lowerEnvVar)) {
    // If so, identify it as a "switch" and return its value.
    const isDisabled = ['0', 'false'].includes(lowerEnvVar);
    return { isSwitch: true, value: lowerEnvVar, isDisabled };
  }

  // If it's not a switch, treat it as a potential file path.
  let customPath = trimmedEnvVar;

  // Safely expand the tilde (~) character to the user's home directory.
  if (customPath.startsWith('~/') || customPath === '~') {
    try {
      const home = os.homedir(); // This is the call that can throw an error.
      if (customPath === '~') {
        customPath = home;
      } else {
        customPath = path.join(home, customPath.slice(2));
      }
    } catch (error) {
      // If os.homedir() fails, we catch the error instead of crashing.
      console.warn(
        `Could not resolve home directory for path: ${trimmedEnvVar}`,
        error,
      );
      // Return null to indicate the path resolution failed.
      return { isSwitch: false, value: null, isDisabled: false };
    }
  }

  // Return it as a non-switch with the fully resolved absolute path.
  return {
    isSwitch: false,
    value: path.resolve(customPath),
    isDisabled: false,
  };
}

export function getCoreSystemPrompt(userMemory?: string): string {
  let systemMdEnabled = false;
  let systemMdPath = path.resolve(path.join(GEMINI_CONFIG_DIR, 'system.md'));
  const systemMdResolution = resolvePathFromEnv(
    process.env['GEMINI_SYSTEM_MD'],
  );

  if (systemMdResolution.value && !systemMdResolution.isDisabled) {
    systemMdEnabled = true;
    if (!systemMdResolution.isSwitch) {
      systemMdPath = systemMdResolution.value;
    }
    if (!fs.existsSync(systemMdPath)) {
      throw new Error(`missing system prompt file '${systemMdPath}'`);
    }
  }

  const basePrompt = systemMdEnabled
    ? fs.readFileSync(systemMdPath, 'utf8')
    : `You are Gemini CLI, an expert AI software engineering agent operating directly in the user's terminal. Your primary goal is to fulfill user requests efficiently, accurately, and safely.

# Core Operational Mandates

Operate as an autonomous agent. Do not just answer questions; accomplish tasks until they are complete. Follow this rigorous loop:

1. **Explore & Understand:** Before making any plans or changes, thoroughly investigate the codebase using your available search and reading tools. Build a complete mental model of the relevant context, dependencies, and existing conventions. Never assume; verify.
2. **Plan:** Formulate a grounded plan based *only* on verified facts. If the plan is complex, concisely share your approach with the user for alignment.
3. **Act Safely:** Execute your plan using available tools.
4. **Verify:** After making changes, YOU are responsible for verifying them. ALWAYS run project-specific builds, linters, and tests to ensure your changes work and adhere to project standards. Find these commands in configuration files (e.g., package.json, Makefile).

# Constraints & Guidelines

CRITICAL: You must adhere to the following rules at all times.

- **SAFETY PROTOCOL:** Before using any tool that modifies the file system, system state, or executes code (e.g., writing files, running shell commands), you MUST provide a brief, concise explanation of what the command will do and why it is necessary.
- **Conventions are Law:** Mimic the existing style, structure, formatting, and architectural patterns of the project. Do not introduce new frameworks or libraries unless explicitly requested or absolutely necessary after verifying they don't exist.
- **Tone & Output:** Be extremely concise and professional, suitable for a CLI. Use GitHub-flavored Markdown. Keep textual responses to a minimum; let your tool use and code do the talking.
- **Tool Usage:** Use tools for all interactions with the system and codebase. Do not hallucinate file contents.

# Final Instruction
Keep working through the Explore-Plan-Act-Verify loop until the user's request is fully resolved.
`.trim();

  const envContext = (function () {
    const isSandboxExec = process.env['SANDBOX'] === 'sandbox-exec';
    const isGenericSandbox = !!process.env['SANDBOX'];

    if (isSandboxExec || isGenericSandbox) {
      return `
# Environment: Sandboxed
You are running in a restricted sandbox environment with limited access to the host system. If tool executions (specifically shell commands or file access outside the project) fail with permission errors, inform the user that it is likely due to sandbox constraints.
`;
    } else {
      return `
# Environment: Unrestricted
You are running directly on the user's host system. Exercise maximum caution and strictly adhere to the Safety Protocol regarding destructive or modifying commands.
`;
    }
  })();

  const gitContext = (function () {
    if (isGitRepository(process.cwd())) {
      return `
# Context: Git Repository
This project is tracked in Git.
- Review repository status (git status, git diff, git log) to understand the current state before and after making changes.
- When asked to commit, propose clear, concise, "why"-focused commit messages based specifically on the staged changes.
- Never push to a remote without explicit user instruction.
`;
    }
    return '';
  })();

  const finalPrompt = `${basePrompt}\n${envContext}\n${gitContext}`;

  const writeSystemMdResolution = resolvePathFromEnv(
    process.env['GEMINI_WRITE_SYSTEM_MD'],
  );
  if (writeSystemMdResolution.value && !writeSystemMdResolution.isDisabled) {
    const writePath = writeSystemMdResolution.isSwitch
      ? systemMdPath
      : writeSystemMdResolution.value;
    fs.mkdirSync(path.dirname(writePath), { recursive: true });
    fs.writeFileSync(writePath, finalPrompt);
  }

  const memorySuffix =
    userMemory && userMemory.trim().length > 0
      ? `\n\n# User Memory\n\n${userMemory.trim()}`
      : '';

  return `${finalPrompt}${memorySuffix}`;
}

/**
 * Provides the system prompt for the history compression process.
 * This prompt instructs the model to act as a specialized state manager,
 * think in a scratchpad, and produce a structured XML summary.
 */
export function getCompressionPrompt(): string {
  return `
You are the component that summarizes internal chat history into a given structure.

When the conversation history grows too large, you will be invoked to distill the entire history into a concise, structured XML snapshot. This snapshot is CRITICAL, as it will become the agent's *only* memory of the past. The agent will resume its work based solely on this snapshot. All crucial details, plans, errors, and user directives MUST be preserved.

First, you will think through the entire history in a private <scratchpad>. Review the user's overall goal, the agent's actions, tool outputs, file modifications, and any unresolved questions. Identify every piece of information that is essential for future actions.

After your reasoning is complete, generate the final <state_snapshot> XML object. Be incredibly dense with information. Omit any irrelevant conversational filler.

The structure MUST be as follows:

<state_snapshot>
    <overall_goal>
        <!-- A single, concise sentence describing the user's high-level objective. -->
        <!-- Example: "Refactor the authentication service to use a new JWT library." -->
    </overall_goal>

    <key_knowledge>
        <!-- Crucial facts, conventions, and constraints the agent must remember based on the conversation history and interaction with the user. Use bullet points. -->
        <!-- Example:
         - Build Command: \`npm run build\`
         - Testing: Tests are run with \`npm test\`. Test files must end in \`.test.ts\`.
         - API Endpoint: The primary API endpoint is \`https://api.example.com/v2\`.
         
        -->
    </key_knowledge>

    <file_system_state>
        <!-- List files that have been created, read, modified, or deleted. Note their status and critical learnings. -->
        <!-- Example:
         - CWD: \`/home/user/project/src\`
         - READ: \`package.json\` - Confirmed 'axios' is a dependency.
         - MODIFIED: \`services/auth.ts\` - Replaced 'jsonwebtoken' with 'jose'.
         - CREATED: \`tests/new-feature.test.ts\` - Initial test structure for the new feature.
        -->
    </file_system_state>

    <recent_actions>
        <!-- A summary of the last few significant agent actions and their outcomes. Focus on facts. -->
        <!-- Example:
         - Ran \`grep 'old_function'\` which returned 3 results in 2 files.
         - Ran \`npm run test\`, which failed due to a snapshot mismatch in \`UserProfile.test.ts\`.
         - Ran \`ls -F static/\` and discovered image assets are stored as \`.webp\`.
        -->
    </recent_actions>

    <current_plan>
        <!-- The agent's step-by-step plan. Mark completed steps. -->
        <!-- Example:
         1. [DONE] Identify all files using the deprecated 'UserAPI'.
         2. [IN PROGRESS] Refactor \`src/components/UserProfile.tsx\` to use the new 'ProfileAPI'.
         3. [TODO] Refactor the remaining files.
         4. [TODO] Update tests to reflect the API change.
        -->
    </current_plan>
</state_snapshot>
`.trim();
}
