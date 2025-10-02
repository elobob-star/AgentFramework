/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { profiler } from './DebugProfiler.js';
import { FixedDeque } from 'mnemonist';

describe('DebugProfiler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    profiler.numFrames = 0;
    profiler.totalIdleFrames = 0;
    profiler.lastFrameStartTime = 0;
    profiler.openedDebugConsole = false;
    profiler.lastActionTimestamp = 0;
    profiler.possiblyIdleFrameTimestamps = new FixedDeque<number>(Array, 1024);
    profiler.actionTimestamps = new FixedDeque<number>(Array, 1024);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should not report frames as idle if an action happens shortly after', async () => {
    const startTime = Date.now();
    vi.setSystemTime(startTime);

    for (let i = 0; i < 5; i++) {
      profiler.reportFrameRendered();
      vi.advanceTimersByTime(20);
    }

    vi.setSystemTime(startTime + 400);
    profiler.reportAction();

    vi.advanceTimersByTime(600);
    profiler.checkForIdleFrames();

    expect(profiler.totalIdleFrames).toBe(0);
  });

  it('should report frames as idle if no action happens nearby', async () => {
    const startTime = Date.now();
    vi.setSystemTime(startTime);

    for (let i = 0; i < 5; i++) {
      profiler.reportFrameRendered();
      vi.advanceTimersByTime(20);
    }

    vi.advanceTimersByTime(1000);
    profiler.checkForIdleFrames();

    expect(profiler.totalIdleFrames).toBe(5);
  });

  it('should not report frames as idle if an action happens shortly before', async () => {
    const startTime = Date.now();
    vi.setSystemTime(startTime);

    profiler.reportAction();

    vi.advanceTimersByTime(400);

    for (let i = 0; i < 5; i++) {
      profiler.reportFrameRendered();
      vi.advanceTimersByTime(20);
    }

    vi.advanceTimersByTime(600);
    profiler.checkForIdleFrames();

    expect(profiler.totalIdleFrames).toBe(0);
  });

  it('should correctly identify mixed idle and non-idle frames', async () => {
    const startTime = Date.now();
    vi.setSystemTime(startTime);

    for (let i = 0; i < 3; i++) {
      profiler.reportFrameRendered();
      vi.advanceTimersByTime(20);
    }

    vi.advanceTimersByTime(1000);

    profiler.reportAction();
    vi.advanceTimersByTime(100);

    for (let i = 0; i < 3; i++) {
      profiler.reportFrameRendered();
      vi.advanceTimersByTime(20);
    }

    vi.advanceTimersByTime(600);
    profiler.checkForIdleFrames();

    expect(profiler.totalIdleFrames).toBe(3);
  });

  it('should not report idle frames when actions are interleaved', async () => {
    const startTime = Date.now();
    vi.setSystemTime(startTime);

    profiler.reportFrameRendered();
    vi.advanceTimersByTime(20);

    profiler.reportFrameRendered();
    vi.advanceTimersByTime(200);

    profiler.reportAction();
    vi.advanceTimersByTime(200);

    profiler.reportFrameRendered();
    vi.advanceTimersByTime(20);

    profiler.reportFrameRendered();

    vi.advanceTimersByTime(600);
    profiler.checkForIdleFrames();

    expect(profiler.totalIdleFrames).toBe(0);
  });
});
