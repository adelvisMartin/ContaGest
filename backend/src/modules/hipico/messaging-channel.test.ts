import test from 'node:test';
import assert from 'node:assert/strict';
import { TestChannelAdapter } from './messaging-channel.js';
void test('TestChannelAdapter injects normalized messages deterministically',async()=>{const channel=new TestChannelAdapter();const received:string[]=[];channel.receive((message)=>received.push(message.externalMessageId));await channel.connect();await channel.inject({channel:'test',groupId:'g1',externalMessageId:'m1',senderId:'p1',sentAt:'2026-09-11T19:00:00.000Z',type:'text',text:'hola',historySync:false,fromMe:false,hasMedia:false});assert.deepEqual(received,['m1']);assert.deepEqual(await channel.status(),{state:'connected',channel:'test'});});
void test('TestChannelAdapter records sends without business side effects',async()=>{const channel=new TestChannelAdapter();await channel.connect();assert.deepEqual(await channel.send('g1','respuesta'),{accepted:true,externalMessageId:'test-1'});assert.deepEqual(channel.sent,[{groupId:'g1',text:'respuesta'}]);});
