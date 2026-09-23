// Owner flows use the existing Telegram update handler. No second webhook/poller.
export function registerOwnerHandlers(bot,{backendUrl,secret,fetchImpl=fetch}){
  async function api(ctx,action,token){
    if(ctx.chat?.type!=='private'||!Number.isSafeInteger(ctx.from?.id)||ctx.from.is_bot)throw Error('Подтверждение доступно только в личном чате');
    if(!backendUrl?.startsWith('https://')||!secret||secret.length<32)throw Error('Привязка владельца ещё не настроена');
    const response=await fetchImpl(`${backendUrl.replace(/\/$/,'')}/api/owner/bot`,{method:'POST',headers:{'Content-Type':'application/json','X-Owner-Bot-Secret':secret},body:JSON.stringify({action,token,telegramId:String(ctx.from.id),name:[ctx.from.first_name,ctx.from.last_name].filter(Boolean).join(' ')}),signal:AbortSignal.timeout(15000)});
    const data=await response.json();if(!response.ok)throw Error(data.error||'Подтверждение недоступно');return data;
  }
  const parse=s=>/^owner_([A-Za-z0-9_-]{43})$/.exec(s||'')?.[1];
  bot.command('myid',async ctx=>{if(ctx.chat?.type==='private')await ctx.reply(`Ваш Telegram ID: ${ctx.from.id}`);});
  bot.action(/^oa_([A-Za-z0-9_-]{43})$/,async ctx=>{
    try{await api(ctx,'approve',ctx.match[1]);await ctx.answerCbQuery('Подтверждено');await ctx.editMessageText('Подтверждено. Вернитесь на iPad, нажмите «Я подтвердил в Telegram» и задайте PIN.');}
    catch(e){await ctx.answerCbQuery('Не удалось подтвердить');await ctx.reply(e.message);}
  });
  bot.action(/^od_([A-Za-z0-9_-]{43})$/,async ctx=>{
    try{await api(ctx,'deny',ctx.match[1]);await ctx.answerCbQuery('Отклонено');await ctx.editMessageText('Запрос отклонён. Данные кассы не изменены.');}
    catch(e){await ctx.answerCbQuery('Не удалось отклонить');await ctx.reply(e.message);}
  });
  return async ctx=>{
    const token=parse(ctx.startPayload);if(!token)return false;
    try{
      const data=await api(ctx,'lookup',token);
      await ctx.reply(`${data.kind==='recover'?'Восстановление PIN владельца':'Привязка владельца'}\n${data.venue}\nСотрудник: ${data.employeeName}\n\nПодтверждайте только запрос, который вы начали на своём iPad. PIN в Telegram вводить не нужно.`,{reply_markup:{inline_keyboard:[[{text:'Подтвердить',callback_data:`oa_${token}`}],[{text:'Отклонить',callback_data:`od_${token}`}]]}});
    }catch(e){await ctx.reply(e.message);}
    return true;
  };
}
