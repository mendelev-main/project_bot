// Owner flows use the existing Telegram update handler. No second webhook/poller.
const OWNER_REPORT_ACTION = 'owner_live_report';

function privateOwnerContext(ctx){
  if(ctx.chat?.type!=='private'||!Number.isSafeInteger(ctx.from?.id)||ctx.from.is_bot)throw Error('Действие доступно только в личном чате');
}

function number(value){return Number(value||0).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2});}
function quantity(value){return Number(value||0).toLocaleString('ru-RU',{maximumFractionDigits:3});}

export function formatLivePosReport(report){
  if(!report?.shiftOpen)return '🟢 POS онлайн\n\nОткрытой смены сейчас нет.';
  const currency=String(report.currency||'BYN');
  const date=new Date(Number(report.generatedAt)||Date.now()).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
  const categories=(report.categories||[]).slice(0,12).map(row=>`• ${row.name}: ${quantity(row.quantity)} · ${number(row.revenue)} ${currency}`);
  const products=(report.products||[]).slice(0,15).map(row=>`• ${row.name}: ${quantity(row.quantity)} · ${number(row.revenue)} ${currency}`);
  return [`📊 M POS · текущая смена`,`Обновлено: ${date}`,...(report.employeeName?[`Сотрудник: ${report.employeeName}`]:[]),'',`Выручка: ${number(report.revenue)} ${currency}`,`Наличные: ${number(report.cash)} ${currency}`,`Карта: ${number(report.card)} ${currency}`,`Чеков: ${Math.trunc(Number(report.orders)||0)}`,'','Продажи по категориям',...(categories.length?categories:['• Продаж пока нет']),'','Продажи по позициям',...(products.length?products:['• Продаж пока нет'])].join('\n').slice(0,4000);
}

export function registerOwnerHandlers(bot,{backendUrl,secret,fetchImpl=fetch}){
  async function request(ctx,path,body){
    privateOwnerContext(ctx);
    if(!backendUrl?.startsWith('https://')||!secret||secret.length<32)throw Error('Сервис владельца ещё не настроен');
    const response=await fetchImpl(`${backendUrl.replace(/\/$/,'')}${path}`,{method:'POST',headers:{'Content-Type':'application/json','X-Owner-Bot-Secret':secret},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
    const data=await response.json().catch(()=>({}));if(!response.ok){const error=Error(data.error||'Сервис владельца недоступен');error.status=response.status;error.code=data.code;throw error}return data;
  }
  async function api(ctx,action,token){
    return request(ctx,'/api/owner/bot',{action,token,telegramId:String(ctx.from.id),name:[ctx.from.first_name,ctx.from.last_name].filter(Boolean).join(' ')});
  }
  async function access(ctx){return request(ctx,'/api/owner/live-report/access',{telegramId:String(ctx.from.id)});}
  async function liveReport(ctx){return request(ctx,'/api/owner/live-report',{telegramId:String(ctx.from.id)});}
  async function sendLiveReport(ctx){
    try{const data=await liveReport(ctx);await ctx.reply(formatLivePosReport(data.report));}
    catch(error){if(error.code==='POS_OFFLINE')await ctx.reply('POS не активен. Откройте M POS и проверьте подключение к интернету.');else if(error.code==='OWNER_FORBIDDEN'||error.status===403)await ctx.reply('Функция доступна только владельцу.');else await ctx.reply(error.message||'Не удалось получить информацию из POS.');}
  }
  const parse=s=>/^owner_([A-Za-z0-9_-]{43})$/.exec(s||'')?.[1];
  bot.command('myid',async ctx=>{if(ctx.chat?.type==='private')await ctx.reply(`Ваш Telegram ID: ${ctx.from.id}`);});
  bot.command('info',sendLiveReport);
  bot.action(OWNER_REPORT_ACTION,async ctx=>{await ctx.answerCbQuery('Запрашиваю данные POS');await sendLiveReport(ctx);});
  bot.action(/^oa_([A-Za-z0-9_-]{43})$/,async ctx=>{
    try{await api(ctx,'approve',ctx.match[1]);await ctx.answerCbQuery('Подтверждено');await ctx.editMessageText('Подтверждено. Вернитесь на iPad, нажмите «Я подтвердил в Telegram» и задайте PIN.');}
    catch(e){await ctx.answerCbQuery('Не удалось подтвердить');await ctx.reply(e.message);}
  });
  bot.action(/^od_([A-Za-z0-9_-]{43})$/,async ctx=>{
    try{await api(ctx,'deny',ctx.match[1]);await ctx.answerCbQuery('Отклонено');await ctx.editMessageText('Запрос отклонён. Данные кассы не изменены.');}
    catch(e){await ctx.answerCbQuery('Не удалось отклонить');await ctx.reply(e.message);}
  });
  const start=async ctx=>{
    const token=parse(ctx.startPayload);if(!token)return false;
    try{
      const data=await api(ctx,'lookup',token);
      await ctx.reply(`${data.kind==='recover'?'Восстановление PIN владельца':'Привязка владельца'}\n${data.venue}\nСотрудник: ${data.employeeName}\n\nПодтверждайте только запрос, который вы начали на своём iPad. PIN в Telegram вводить не нужно.`,{reply_markup:{inline_keyboard:[[{text:'Подтвердить',callback_data:`oa_${token}`}],[{text:'Отклонить',callback_data:`od_${token}`}]]}});
    }catch(e){await ctx.reply(e.message);}
    return true;
  };
  start.showMenu=async ctx=>{
    try{await access(ctx);await ctx.reply('Панель владельца M POS',{reply_markup:{inline_keyboard:[[{text:'📊 Получить информацию',callback_data:OWNER_REPORT_ACTION}]]}});return true}
    catch(error){if(error.code==='OWNER_FORBIDDEN'||error.status===403)return false;return false}
  };
  return start;
}
