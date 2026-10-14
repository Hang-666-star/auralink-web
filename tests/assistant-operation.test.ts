import test from 'node:test';
import assert from 'node:assert/strict';
import { OperationLedger } from '../lib/assistant-api.ts';
const storage = () => { const data = new Map<string, string>(); return { data, getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } }; };

test('same unresolved operation survives a client instance restart without retaining conversation bodies', async () => {
 const store = storage(); const body = { text: '不应该持久到浏览器存储的私人文字', attachmentIds: ['private-image-id'] };
 const first = await new OperationLedger(store, 'account-one').key('chat:session', body);
 const second = await new OperationLedger(store, 'account-one').key('chat:session', body);
 assert.equal(first, second);
 const serialized = [...store.data.values()].join(''); assert(!serialized.includes(body.text)); assert(!serialized.includes('private-image-id'));
});
test('uncertain payload conflict never silently produces a replacement request key', async () => {
 const store = storage(); const ledger = new OperationLedger(store); const first = await ledger.key('chat', { text: '旧内容' });
 await assert.rejects(ledger.key('chat', { text: '新内容' }), /结果尚未确认/);
 assert.equal(await ledger.key('chat', { text: '旧内容' }), first);
});
test('operation and account namespaces do not collide; only confirmed completion retires a key', async () => {
 const store = storage(); const a = new OperationLedger(store, 'account-a'); const b = new OperationLedger(store, 'account-b');
 const first = await a.key('chat', { text: '相同' });
 assert.notEqual(await a.key('summary', { text: '相同' }), first);
 assert.notEqual(await b.key('chat', { text: '相同' }), first);
 a.resolved('chat'); assert.notEqual(await a.key('chat', { text: '相同' }), first);
});
test('unavailable browser storage retains in-memory idempotency', async () => {
 const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
 const ledger = new OperationLedger(blocked); assert.equal(await ledger.key('chat', 1), await ledger.key('chat', 1));
});
