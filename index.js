require('dotenv').config()
const venom = require('venom-bot');
const { google } = require('googleapis');
const fs = require('fs');

async function authenticateGoogleSheets() {
  const credentials = JSON.parse(
    fs.readFileSync('C:/Users/y.mota/USBY/usb-bot/locked/vertical-sunset-454212-d1-3eb2a71f7ad2.json', 'utf-8')
  );

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

async function addMessageToSheet(sheets, message, userPhoneNumber) {
  const sheetId = '18akn_Oi_2L2IakzW-2_JUy6I88JhPmCKHnrXWg-cLic';
  const range = 'Lançamento de Nota Fiscal!A2:M2';

  const uniqueId = Math.floor(100000 + Math.random() * 900000).toString() + Date.now().toString().slice(-3);
  const values = [
    uniqueId, message.tipo, message.cod, message.nome, message.data, message.coo,
    message.operadora, message.ecf, message.valor, message.email || "-",
    userPhoneNumber, new Date().toLocaleString()
  ];

  const resource = { values: [values] };

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: range,
      valueInputOption: 'USER_ENTERED',
      resource: resource,
    });
    console.log('✅ Mensagem registrada com sucesso!');
    return uniqueId;
  } catch (error) {
    console.error('❌ Erro ao registrar mensagem:', error.response?.data || error.message);
    return null;
  }
}

function parseMessage(message) {
  const lancamentoNotaPattern = /Lançamento de Cupom Fiscal\s+Cod: \s*(\d+)\s*Nome: ([\wÀ-ÿ\s]+)\s+Data:\s*(\d{2}\/\d{2}\/\d{4})\s+Coo: (\d+)\s+Operadora: ([\wÀ-ÿ\s]+)\s+Ecf: (\d+)\s+Valor: (R\$ [\d,]+\.\d{2})/;
  const lancamentoNotinhaPattern = /Lançamento de Notinha Branca\s+Cod:\s*(\d+)\s+Nome:\s*([\wÀ-ÿ\s]+)\s+Data:\s*(\d{2}\/\d{2}\/\d{4})\s+Valor:\s*(R\$\s*[\d,.]+)/;
  const aumentoLimitePattern = /Aumento de Limite[\s\S]*?Cod: (\d+)[\s\S]*?Nome: ([\w\s]+)[\s\S]*?Valor: (R\$ [\d,]+\.\d{2})[\s\S]*?E-mail: ([\w\.\-]+@[\w\-]+\.[a-z]{2,})/;

  let responseMessage = '';
  let messageData = {};

  if (lancamentoNotaPattern.test(message.body)) {
    const match = message.body.match(lancamentoNotaPattern);
    if (!match) return { responseMessage: 'Erro ao processar mensagem.', messageData: {} };
    messageData = { tipo: 'Lançamento de Cupom Fiscal', cod: match[1], nome: match[2], data: match[3], coo: match[4], operadora: match[5], ecf: match[6], valor: match[7], email: "" };
    responseMessage = `Você enviou um lançamento de nota fiscal:\n\nCod: ${match[1]}\nNome: ${match[2]}\nData: ${match[3]}\nCoo: ${match[4]}\nOperadora: ${match[5]}\nEcf: ${match[6]}\nValor: ${match[7]}`;
  } else if (lancamentoNotinhaPattern.test(message.body)) {
    const match = message.body.match(lancamentoNotinhaPattern);
    if (!match) return { responseMessage: 'Erro ao processar mensagem.', messageData: {} };
    messageData = { tipo: 'Lançamento de Notinha Branca', cod: match[1], nome: match[2], data: match[3], coo: "-", operadora: "-", ecf: "-", valor: match[4], email: "-" };
    responseMessage = `Você enviou um lançamento de notinha branca:\n\nCod: ${match[1]}\nNome: ${match[2]}\nData: ${match[3]}\nValor: ${match[4]}`;
  } else if (aumentoLimitePattern.test(message.body)) {
    const match = message.body.match(aumentoLimitePattern);
    if (!match) return { responseMessage: 'Erro ao processar mensagem.', messageData: {} };
    messageData = { tipo: 'Aumento de Limite', cod: match[1], nome: match[2], data: "-", coo: "-", operadora: "-", ecf: "-", valor: match[3], email: match[4] };
    responseMessage = `Você enviou um aumento de limite:\n\nCod: ${match[1]}\nNome: ${match[2]}\nValor: ${match[3]}\nE-mail: ${match[4]}`;
  } else {
    responseMessage = 'Mensagem não reconhecida.';
    messageData = {};
  }
  return { responseMessage, messageData };
}

venom.create({ session: 'my-session', headless: 'new', browserArgs: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] }).then((client) => {
  client.onMessage(async (message) => {
    if (message.body) {
      console.log(`📩 Mensagem recebida: ${message.body}`);
      const userPhoneNumber = message.from;
      const { responseMessage, messageData } = parseMessage(message);
      if (messageData.tipo) {
        const sheets = await authenticateGoogleSheets();
        const messageId = await addMessageToSheet(sheets, messageData, userPhoneNumber);
        if (messageId) {
          client.sendText(message.from, `✅ Mensagem registrada com sucesso! Seu ID de confirmação é: #${messageId}`);
        } else {
          client.sendText(message.from, '⚠️ Erro ao registrar mensagem. Entre em contato com meu chefe: 99963-0454');
        }
      } else {
        client.sendText(message.from, responseMessage);
      }
    }
  });
}).catch((error) => {
  console.log('❌ Erro ao criar o bot:', error);
});
