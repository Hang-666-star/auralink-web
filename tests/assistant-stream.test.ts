import test from 'node:test';
import assert from 'node:assert/strict';
import { AssistantEventDecoder, applyAssistantEvent } from '../lib/assistant-stream.ts';
import type { Run } from '../lib/assistant-contracts.ts';

const run: Run = { id: 'run-a', sessionId: 'session-a', branchId: 'branch-a', kind: 'CHAT', status: 'EXECUTING', inputMessageId: 'message-a', modelKey: 'text', sequence: 2, checkpoint: '已保存', retryOf: null, attempt: 1, executionUncertain: false, retrieval: {}, usage: {}, errorCode: null, createdAt: '', updatedAt: '' };
const event = (sequence: number, text = '水墨山水') => ({ contractVersion: 1, runId: run.id, branchId: run.branchId, sequence, text });
const frame = (payload: object, sequence: number, kind = 'message.delta', newline = '\n') => `id: ${sequence}${newline}event: ${kind}${newline}data: ${JSON.stringify(payload)}${newline}${newline}`;

test('Chinese UTF-8 and CRLF split at every byte deliver one complete persisted frame', () => {
 const decoder = new AssistantEventDecoder(); const bytes = new TextEncoder().encode(frame(event(3), 3, 'message.delta', '\r\n'));
 const events = [...bytes].flatMap(byte => decoder.push(new Uint8Array([byte])));
 assert.equal(events.length, 1); assert.equal(events[0].text, '水墨山水');
 assert.equal(applyAssistantEvent(run, events[0]).checkpoint, '已保存水墨山水');
});
test('unfinished EOF does not emit a checkpoint or manufacture completed state', () => {
 const decoder = new AssistantEventDecoder();
 assert.deepEqual(decoder.push(new TextEncoder().encode(frame(event(3), 3).slice(0, -1)), true), []);
 assert.equal(run.status, 'EXECUTING');
});
test('duplicate events are not applied twice; wrong identity and sequence gaps refuse', () => {
 const incoming = { ...event(3), event: 'message.delta' };
 const next = applyAssistantEvent(run, incoming);
 assert.equal(applyAssistantEvent(next, incoming), next);
 assert.throws(() => applyAssistantEvent(run, { ...incoming, runId: 'foreign' }), /来源/);
 assert.throws(() => applyAssistantEvent(run, { ...incoming, branchId: 'foreign' }), /来源/);
 assert.throws(() => applyAssistantEvent(run, { ...incoming, sequence: 4 }), /序号/);
});
test('snapshot replaces old partial content at an advanced cursor and preserves terminal state', () => {
 const next = applyAssistantEvent(run, { ...event(99, '完整的已保存答案'), event: 'message.snapshot', state: 'INTERRUPTED', executionUncertain: true });
 assert.equal(next.checkpoint, '完整的已保存答案'); assert.equal(next.sequence, 99); assert.equal(next.status, 'INTERRUPTED'); assert.equal(next.executionUncertain, true);
});
test('explicit server terminal event, not transport EOF, determines completion', () => {
 const decoder = new AssistantEventDecoder();
 const value = { ...event(3), text: undefined, state: 'COMPLETED' };
 const events = decoder.push(new TextEncoder().encode(frame(value, 3, 'run.state')), true);
 assert.equal(applyAssistantEvent(run, events[0]).status, 'COMPLETED');
 assert.equal(applyAssistantEvent(run, events[0]).checkpoint, '已保存');
});
test('SSE comments and multiline JSON are parsed without leaking incomplete events', () => {
 const raw = ': keepalive\n\nid: 3\nevent: message.delta\ndata: {"contractVersion":1,"runId":"run-a",\ndata: "branchId":"branch-a","sequence":3,"text":"花鸟"}\n\n';
 const events = new AssistantEventDecoder().push(new TextEncoder().encode(raw));
 assert.equal(events.length, 1); assert.equal(events[0].text, '花鸟');
});
test('invalid UTF-8 and id/payload sequence mismatch fail closed', () => {
 assert.throws(() => new AssistantEventDecoder().push(new Uint8Array([0xff]), true));
 assert.throws(() => new AssistantEventDecoder().push(new TextEncoder().encode(frame(event(3), 4))), /身份/);
});
test('incomplete unbounded frame is rejected', () => {
 assert.throws(() => new AssistantEventDecoder().push(new TextEncoder().encode('x'.repeat(1048577))), /上限/);
});
test('invalid text/state types and unknown event variants are rejected before UI callbacks', () => {
 for (const value of [ { ...event(3), text: {} }, { ...event(3), text: null } ]) {
  assert.throws(() => new AssistantEventDecoder().push(new TextEncoder().encode(frame(value, 3))), /正文/);
 }
 assert.throws(() => new AssistantEventDecoder().push(new TextEncoder().encode(frame({ ...event(3), state: 'MADE_UP' }, 3, 'run.state'))), /状态/);
 assert.throws(() => new AssistantEventDecoder().push(new TextEncoder().encode(frame({ ...event(3), state: 'COMPLETED' }, 3))), /事件/);
 assert.throws(() => new AssistantEventDecoder().push(new TextEncoder().encode(frame(event(3), 3, 'new.execution'))), /身份/);
});
test('frame limit is UTF-8 bytes; a coalesced HTTP chunk can contain multiple bounded frames', () => {
 const decoder = new AssistantEventDecoder();
 const one = frame(event(3, '中'.repeat(190000)), 3);
 const two = frame(event(4, '文'.repeat(190000)), 4);
 assert.equal(decoder.push(new TextEncoder().encode(one + two)).length, 2);
 assert.throws(() => new AssistantEventDecoder().push(new TextEncoder().encode(frame(event(3, '中'.repeat(350000)), 3))), /上限/);
});
