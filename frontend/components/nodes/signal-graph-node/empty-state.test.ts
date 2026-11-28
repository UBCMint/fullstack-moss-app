import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getSignalGraphEmptyStateMessage } from './empty-state';

test('prompts the user to start an idle stream', () => {
    assert.equal(
        getSignalGraphEmptyStateMessage(false, false),
        'Start data stream to visualize signals.'
    );
});

test('waits for samples after streaming starts and hides the message once data arrives', () => {
    assert.equal(
        getSignalGraphEmptyStateMessage(false, true),
        'Waiting for signal data…'
    );
    assert.equal(getSignalGraphEmptyStateMessage(true, true), null);
    assert.equal(getSignalGraphEmptyStateMessage(true, false), null);
});
