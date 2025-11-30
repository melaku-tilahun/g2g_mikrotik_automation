require('dotenv').config();
const fetch = require('node-fetch');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function getUpdates(offset = 0) {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/getUpdates?offset=${offset}&limit=100`;
  const res = await fetch(url);
  return res.json();
}

async function deleteMessage(messageId) {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/deleteMessage?chat_id=${CHAT_ID}&message_id=${messageId}`;
  const res = await fetch(url);
  return res.json();
}

async function deleteBotMessages() {
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const updates = await getUpdates(offset);

    if (!updates.ok || updates.result.length === 0) {
      hasMore = false;
      break;
    }

    for (const update of updates.result) {
      const msg = update.message;
      if (msg && msg.chat.id.toString() === CHAT_ID && msg.from.is_bot) {
        console.log(`Deleting message ${msg.message_id}`);
        await deleteMessage(msg.message_id);
      }

      offset = update.update_id + 1;
    }
  }

  console.log('Finished deleting bot messages.');
}

deleteBotMessages().catch(console.error);
