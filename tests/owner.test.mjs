import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registerOwnerHandlers} from '../src/owner.js';
function fixture(){const actions=[],commands={},calls=[],messages=[];
 const bot={command:(name,fn)=>commands[name]=fn,action:(pattern,fn)=>actions.push({pattern,fn})};
 const start=registerOwnerHandlers(bot,{backendUrl:'https://example.test',secret:'s'.repeat(43),fetchImpl:async(url,options)=>{calls.push({url,options,body:JSON.parse(options.body)});return{ok:true,json:async()=>({kind:'bind',venue:'Кафе',employeeName:'Owner'})};}});
 const ctx={chat:{type:'private'},from:{id:123,first_name:'Owner'},startPayload:'owner_'+'t'.repeat(43),reply:async(...args)=>messages.push(args),answerCbQuery:async()=>{},editMessageText:async m=>messages.push([m])};
 return{actions,commands,calls,messages,start,ctx};
}
test('ordinary checkout /start passes through; Owner uses existing bot',async()=>{const f=fixture();f.ctx.startPayload='checkout-token';assert.equal(await f.start(f.ctx),false);assert.equal(f.calls.length,0);});
test('owner link confirms actual sender and uses authenticated backend callback',async()=>{const f=fixture();assert.equal(await f.start(f.ctx),true);assert.equal(f.calls[0].body.telegramId,'123');assert.equal(f.calls[0].options.headers['X-Owner-Bot-Secret'],'s'.repeat(43));const keyboard=f.messages[0][1].reply_markup.inline_keyboard;assert.ok(keyboard[0][0].callback_data.length<=64);assert.match(f.messages[0][0],/PIN в Telegram вводить не нужно/);});
test('group chat and bot sender cannot bind or recover',async()=>{for(const mode of ['group','bot']){const f=fixture();if(mode==='group')f.ctx.chat.type='supergroup';else f.ctx.from.is_bot=true;await f.start(f.ctx);assert.equal(f.calls.length,0);assert.match(f.messages[0][0],/личном чате/);}});
test('approval callback takes user ID from Telegram context, never callback payload',async()=>{const f=fixture();const handler=f.actions[0];f.ctx.match=handler.pattern.exec('oa_'+'t'.repeat(43));f.ctx.from.id=456;await handler.fn(f.ctx);assert.equal(f.calls[0].body.telegramId,'456');assert.equal(f.calls[0].body.action,'approve');});
test('myid is available only in private chat and does not send credentials',async()=>{const f=fixture();f.ctx.chat.type='group';await f.commands.myid(f.ctx);assert.equal(f.messages.length,0);f.ctx.chat.type='private';await f.commands.myid(f.ctx);assert.equal(f.messages[0][0],'Ваш Telegram ID: 123');assert.equal(f.calls.length,0);});
