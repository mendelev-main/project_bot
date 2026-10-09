// The sender identity comes from Telegram after confirming the sender's own contact.
export function verificationPayload(phone, telegramUserId, telegramUsername) {
  return {phone,telegramUserId,telegramUsername:typeof telegramUsername==='string'?telegramUsername:null};
}
