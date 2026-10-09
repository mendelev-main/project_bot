import test from 'node:test';
import assert from 'node:assert/strict';
import {verificationPayload} from '../src/verification-payload.js';
test('verification carries Telegram sender username and explicit absence',()=>{
 assert.deepEqual(verificationPayload('synthetic',123,'valid_user'),{phone:'synthetic',telegramUserId:123,telegramUsername:'valid_user'});
 assert.equal(verificationPayload('synthetic',123,undefined).telegramUsername,null);
});
