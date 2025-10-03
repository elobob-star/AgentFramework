# Error Handling Module Implementation Plan - Updated

## 1. Executive Summary

This comprehensive plan outlines the refactoring of our error handling system into a dedicated, self-contained module. We will create a new directory `packages/core/src/utils/errors/` that consolidates all error-related code, including types currently misplaced in other modules (like `StructuredError` in `turn.ts`).

The refactor will:

- Separate type definitions from runtime logic
- Move misplaced error types to their proper location
- Consolidate duplicate logic
- Provide a stable public API
- Result in a minor breaking change with a clear, low-impact migration path

## 2. Final Directory Structure

```
packages/core/src/utils/errors/
├── index.ts              # Public API exports
├── errorTypes.ts         # All error-related types and classes (camelCase naming)
├── errorParsing.ts       # All runtime error handling logic
└── errorParsing.test.ts  # Comprehensive test suite
```

## 3. File Responsibilities & Contents

### 3.1 errorTypes.ts - Type Definitions

**Purpose**: Central location for all error-related types, interfaces, enums, and classes

**Will contain:**

- `StructuredError` interface (moved from turn.ts)
- `ParsedError` interface
- `ParsedErrorType` enum
- `FatalError` class and all its subclasses:
  - `FatalAuthenticationError`
  - `FatalInputError`
  - `FatalSandboxError`
  - `FatalConfigError`
  - `FatalTurnLimitedError`
  - `FatalToolExecutionError`
  - `FatalCancellationError`
- Supporting interfaces (marked as @internal):
  - `GaxiosError` (internal only - with /\*_ @internal _/ TSDoc)
  - `ResponseData` (internal only - with /\*_ @internal _/ TSDoc)

**Note**: HTTP error classes (UnauthorizedError, ForbiddenError, BadRequestError) will be removed as part of this refactor. Error classification will be handled through ParsedError.type and statusCode instead.

### 3.2 errorParsing.ts - Runtime Logic

**Purpose**: All error processing, parsing, and handling functions

**Will contain:**

- Core parsing function (THE source of truth for error analysis):
  - `parseError()` - Analyzes and classifies ALL errors, including Gaxios
- Helper functions:
  - `isNodeError()`
  - `getErrorMessage()`
- Compatibility layer (for smooth migration):
  - `createFatalError(message, exitCode)` - Factory function
  - `isFatalError(error)` - Type guard

**Note**: `toFriendlyError` will be removed entirely. Consumers will use `parseError()` directly and check `parsed.statusCode` or `parsed.type` for control flow.

- Deprecated function:
  - `parseAndFormatApiError()` - Marked as deprecated
- Internal helpers (not exported):
  - All existing internal parsing functions

### 3.3 index.ts - Public API

**Purpose**: Stable entry point for all consumers

**Will export:**

```typescript
// Types
export type { StructuredError, ParsedError } from './errorTypes.js';
export { ParsedErrorType } from './errorTypes.js';

// Error classes
export {
  FatalError,
  FatalAuthenticationError,
  FatalInputError,
  FatalSandboxError,
  FatalConfigError,
  FatalTurnLimitedError,
  FatalToolExecutionError,
  FatalCancellationError,
} from './errorTypes.js';

// Functions
export {
  parseError,
  parseAndFormatApiError, // deprecated
  isNodeError,
  getErrorMessage,
  // Compatibility layer
  createFatalError,
  isFatalError,
} from './errorParsing.js';
```

### 3.4 errorParsing.test.ts - Tests

**Purpose**: Comprehensive test coverage for all error handling logic

**Will contain:**

- All existing tests from current errorParsing.test.ts
- New tests for compatibility layer functions
- Tests for StructuredError handling
- Integration tests for the complete error flow

## 4. Implementation Phases

### Phase 1: Create Module Structure

1. Create directory: `packages/core/src/utils/errors/`
2. Create empty files:
   - `index.ts`
   - `errorTypes.ts`
   - `errorParsing.ts`
   - `errorParsing.test.ts`

### Phase 2: Migrate Type Definitions

1. Move to `errorTypes.ts`:
   - All interfaces, enums, and classes from `packages/core/src/utils/errors.ts`
   - `StructuredError` interface from `packages/core/src/core/turn.ts`
   - Type definitions from `packages/core/src/utils/errorParsing.ts`
2. Add import in `error_types.ts` for any external dependencies

### Phase 3: Migrate Runtime Logic

1. Move to `errorParsing.ts`:
   - All functions from `packages/core/src/utils/errors.ts`
   - All functions from `packages/core/src/utils/errorParsing.ts`
2. Update imports in `errorParsing.ts`:
   - Import types from `./errorTypes.js`
   - Import external dependencies (quotaErrorDetection, config/models, etc.)

### Phase 4: Consolidate Logic

1. Make `parseError` the single source of truth:
   - Enhance `parseError` to handle Gaxios errors directly (absorb logic from old `toFriendlyError`)
   - It becomes THE function for understanding any error
   - Remove `toFriendlyError` entirely
2. Implement compatibility layer functions:

   ```typescript
   // Factory functions for migration
   export function createFatalError(
     message: string,
     exitCode: number,
   ): FatalError {
     return new FatalError(message, exitCode);
   }

   // A type guard for the FatalError class hierarchy
   export function isFatalError(error: unknown): error is FatalError {
     return error instanceof FatalError;
   }
   ```

### Phase 5: Setup Public API

1. Populate `index.ts` with all necessary exports.

### Phase 6: Migrate Tests

1. Move all tests from current `errorParsing.test.ts` to new location
2. Add tests for:
   - Compatibility layer functions
   - StructuredError parsing
   - Migration from toFriendlyError to parseError
3. Ensure 100% code coverage

### Phase 7: Update Import Paths and Usage

1. Update `packages/core/src/index.ts`:
   - Change: `export * from './utils/errors.js';`
   - To: `export * from './utils/errors/index.js';`
   - Remove: `export * from './utils/errorParsing.js';`

2. Update `packages/core/src/core/turn.ts`:

   ```typescript
   // Import changes:
   import type { StructuredError } from '../utils/errors/index.js';
   import { parseError, getErrorMessage } from '../utils/errors/index.js';

   // Usage change (around line 304):
   // BEFORE:
   const error = toFriendlyError(e);
   if (error instanceof UnauthorizedError) {
     throw error;
   }

   // AFTER:
   const parsed = parseError(e);
   if (parsed.statusCode === 401) {
     // Throw a regular error, not a class instance
     throw new Error(parsed.errorMessage);
   }
   ```

3. Update `packages/cli/src/ui/hooks/useGeminiStream.ts`:

   ```typescript
   // Import changes:
   import { parseError } from '@google/gemini-cli-core';

   // Usage change:
   // BEFORE:
   if (error instanceof UnauthorizedError) {
     onAuthError('Session expired or is unauthorized.');
   }

   // AFTER:
   const parsed = parseError(error);
   if (parsed.statusCode === 401) {
     onAuthError('Session expired or is unauthorized.');
   }
   ```

4. Update all other files importing from errors.ts (~18 remaining files)

**Option B: Codemod Approach (Recommended for safety)**

Use a TypeScript-aware codemod for safer, more precise updates:

```typescript
// Example using ts-morph for import updates
import { Project } from 'ts-morph';

const project = new Project({
  tsConfigFilePath: 'tsconfig.json',
});

// Update all imports from errors.js to errors/index.js
project.getSourceFiles().forEach((sourceFile) => {
  sourceFile.getImportDeclarations().forEach((importDecl) => {
    const moduleSpec = importDecl.getModuleSpecifierValue();

    // Update errors.js imports
    if (moduleSpec.includes('/utils/errors.js')) {
      importDecl.setModuleSpecifier(
        moduleSpec.replace('/utils/errors.js', '/utils/errors/index.js'),
      );
    }

    // Remove errorParsing.js imports (they'll come from errors/index.js)
    if (moduleSpec.includes('/utils/errorParsing.js')) {
      importDecl.setModuleSpecifier(
        moduleSpec.replace('/utils/errorParsing.js', '/utils/errors/index.js'),
      );
    }
  });
});

await project.save();
```

Benefits of codemod approach:

- Understands TypeScript/JavaScript AST structure
- Won't accidentally change strings that happen to match the pattern
- Can handle complex import statements (renamed imports, destructured imports)
- Provides a dry-run option to preview changes
- Can be version-controlled and reviewed before applying

### Phase 8: Gradual Migration of Usage Patterns

1. Update error instantiation patterns (can be done gradually):

   ```typescript
   // Old pattern
   throw new FatalAuthenticationError('Auth failed');

   // New pattern (recommended)
   throw createFatalError('Auth failed', 41);
   ```

2. Update error checking patterns (can be done gradually):

   ```typescript
   // Old pattern
   if (error instanceof UnauthorizedError) { ... }

   // New pattern (recommended)
   const parsed = parseError(error);
   if (parsed.statusCode === 401) {
     // handle unauthorized
   }
   ```

### Phase 9: Testing & Validation

1. Run `npm run preflight` to ensure all tests pass
2. Verify no breaking changes in:
   - `packages/cli/` (has its own error utilities that depend on core)
   - `packages/a2a-server/` (imports from @google/gemini-cli-core)
3. Test that all existing error handling flows work correctly

### Phase 10: Cleanup

1. Delete old files:
   - `packages/core/src/utils/errors.ts`
   - `packages/core/src/utils/errorParsing.ts`
2. Remove any old test files associated with deleted files
3. Update any documentation or comments referencing old file paths

## 5. Migration Patterns for Consumers

### 5.1 Import Changes

```typescript
// Before (multiple imports)
import {
  FatalError,
  toFriendlyError,
  UnauthorizedError,
} from '../utils/errors.js';
import { parseAndFormatApiError } from '../utils/errorParsing.js';

// After (single import point)
import { FatalError, parseError } from '../utils/errors/index.js';
```

### 5.2 Error Creation

```typescript
// Before
throw new FatalAuthenticationError('Authentication failed');

// After (immediate migration)
throw new FatalAuthenticationError('Authentication failed'); // Still works

// After (recommended pattern)
throw createFatalError('Authentication failed', 41);
```

### 5.3 Error Checking

```typescript
// Before
if (error instanceof UnauthorizedError) {
  // handle unauthorized
}

// After
const parsed = parseError(error);
if (parsed.statusCode === 401) {
  // handle unauthorized
}

// Or check by type
if (parsed.type === ParsedErrorType.AUTH) {
  // handle auth errors (401 and 403)
}
```

## 6. Benefits of This Approach

1. **Clear Separation of Concerns**: Types (what) are cleanly separated from logic (how)
2. **Improved Organization**: Consolidates misplaced error types (like StructuredError)
3. **Single Source of Truth**: All error handling logic in one place
4. **Enhanced Type Safety**: The `ParsedError` object provides clear, structured information.
5. **Low-Impact Migration**: The breaking change only affects two files, making the update straightforward.
6. **Better Testability**: Co-located tests with clear module boundaries
7. **Stable Public API**: index.ts provides a stable entry point
8. **Future-Proof**: Easy to extend without affecting consumers

## 7. Risk Mitigation

1. **Manageable Scope**: The breaking change is small and well-understood, minimizing risk.
2. **Clear Migration Path**: The "Before" and "After" patterns are clearly documented.
3. **Comprehensive Testing**: Tests at each phase ensure nothing breaks.
4. **Atomic Changes**: Each phase is self-contained and can be validated independently.

## 8. Success Criteria

- [ ] All existing tests pass after the refactor
- [ ] The two affected consumer files are updated and function correctly
- [ ] 100% test coverage for new error module
- [ ] All error-related code consolidated in one location
- [ ] StructuredError moved from turn.ts to error module
- [ ] Single import point for all error-related functionality
- [ ] Clear migration path documented for future updates

## 9. Implementation Best Practices

### 9.1 Internal-Only Interfaces

Mark implementation detail interfaces with TSDoc `@internal` tag:

```typescript
// In errorTypes.ts
/** @internal */
interface GaxiosError {
  response?: {
    data?: unknown;
  };
}

/** @internal */
interface ResponseData {
  error?: {
    code?: number;
    message?: string;
  };
}
```

This signals to developers that these interfaces are implementation details and should not be used directly outside the error module.

### 9.2 Performance Considerations

Since HTTP error classes are removed, error checking is now done through `parseError()`:

```typescript
// For performance-critical paths, consider caching the parsed result:
const parsed = parseError(error);

// Then use the parsed result for multiple checks:
if (parsed.statusCode === 401) {
  // handle unauthorized
} else if (parsed.statusCode === 403) {
  // handle forbidden
} else if (parsed.type === ParsedErrorType.RATE_LIMIT) {
  // handle rate limits
}

// For FatalError classes (which we're keeping), type guards remain simple:
export function isFatalError(error: unknown): error is FatalError {
  return error instanceof FatalError;
}
```

### 9.3 Code Organization

- Keep all internal helper functions at the bottom of `errorParsing.ts`
- Export only what's necessary through `index.ts`
- Use clear section comments to separate different categories of functions

## 10. Post-Implementation Tasks

1. Update developer documentation
2. Create migration guide for team
3. Consider deprecation timeline for compatibility functions
4. Monitor for any issues in production
5. Plan for eventual removal of deprecated functions (v2.0)
