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

// Função para obter ou atualizar informações do contato
async function getOrUpdateContact(sheets, phoneNumber) {
  const sheetId = '18akn_Oi_2L2IakzW-2_JUy6I88JhPmCKHnrXWg-cLic'; // ID da planilha de contatos
  const range = 'Contatos!A:C'; // Planilha de Contatos, colunas A a C

  try {
    // Buscar dados da planilha
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: range,
    });

    const rows = response.data.values || [];

    // Procurar contato pelo número de telefone
    const contactRow = rows.find(row => row[1] === phoneNumber);

    if (contactRow) {
      // Se encontrar, retorna o nome salvo
      return contactRow[0] || phoneNumber;
    } else {
      // Se não encontrar, adicionar novo contato com o número
      const newContact = [phoneNumber, phoneNumber, new Date().toLocaleString()];

      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: range,
        valueInputOption: 'USER_ENTERED',
        resource: { values: [newContact] },
      });

      return phoneNumber;
    }
  } catch (error) {
    console.error('❌ Erro ao gerenciar contatos:', error);
    return phoneNumber; // Fallback para o número em caso de erro
  }
}

function parseMessage(message) {
  // Converte a mensagem para um formato padrão para melhor matching
  const normalizedBody = message.body.replace(/\s+/g, ' ').trim();

  // Padrões atualizados para capturar campos opcionais como observação
  const lancamentoNotaPattern = /Lançamento de Cupom Fiscal\s+Cod:\s*(\d+)\s+Nome:\s*([\wÀ-ÿ\s]+)\s+Data:\s*(\d{2}\/\d{2}\/\d{4})\s+Coo:\s*(\d+)\s+Operadora:\s*([\wÀ-ÿ\s]+)\s+Ecf:\s*(\d+)\s+Valor:\s*(R\$\s*[\d,.]+)(?:\s+Observação:\s*([\s\S]*))?/i;

  const lancamentoNotinhaPattern = /Lançamento de Notinha Branca\s+Cod:\s*(\d+)\s+Nome:\s*([\wÀ-ÿ\s]+)\s+Data:\s*(\d{2}\/\d{2}\/\d{4})\s+Valor:\s*(R\$\s*[\d,.]+)(?:\s+Observação:\s*([\s\S]*))?/i;

  const aumentoLimitePattern = /Aumento de Limite\s+Cod:\s*(\d+)\s+Nome:\s*([\wÀ-ÿ\s]+)\s+Valor:\s*(R\$\s*[\d,.]+)\s+E-mail:\s*([\w.+-]+@[\w-]+\.[a-zA-Z0-9-.]+)/i;

  // Novos padrões para Situação 70
  const adicionarSituacao70Pattern = /Adicionar Situação 70\s+Cod:\s*(\d+)\s+Nome:\s*([\wÀ-ÿ\s]+)/i;
  const removerSituacao70Pattern = /Remover Situação 70\s+Cod:\s*(\d+)\s+Nome:\s*([\wÀ-ÿ\s]+)/i;

  let responseMessage = '';
  let messageData = {};

  // Verificação para lançamento de cupom fiscal
  if (lancamentoNotaPattern.test(normalizedBody)) {
    const match = normalizedBody.match(lancamentoNotaPattern);
    if (!match) return { responseMessage: 'Erro ao processar mensagem.', messageData: {} };

    messageData = {
      tipo: 'Lançamento de Cupom Fiscal',
      cod: match[1],
      nome: match[2].trim(),
      data: match[3],
      coo: match[4],
      operadora: match[5].trim(),
      ecf: match[6],
      valor: match[7],
      email: "",
      observacao: match[8] || "" // Campo opcional
    };

    responseMessage = `Lançamento de Cupom Fiscal:\n\nCod: ${match[1]}\nNome: ${match[2]}\nData: ${match[3]}\nCoo: ${match[4]}\nOperadora: ${match[5]}\nEcf: ${match[6]}\nValor: ${match[7]}`;

    // Adiciona observação se existir
    if (match[8]) {
      responseMessage += `\nObservação: ${match[8]}`;
    }
  }
  // Verificação para lançamento de notinha branca
  else if (lancamentoNotinhaPattern.test(normalizedBody)) {
    const match = normalizedBody.match(lancamentoNotinhaPattern);
    if (!match) return { responseMessage: 'Erro ao processar mensagem.', messageData: {} };

    messageData = {
      tipo: 'Lançamento de Notinha Branca',
      cod: match[1],
      nome: match[2].trim(),
      data: match[3],
      coo: "-",
      operadora: "-",
      ecf: "-",
      valor: match[4],
      email: "-",
      observacao: match[5] || "" // Campo opcional
    };

    responseMessage = `Lançamento de Notinha Branca:\n\nCod: ${match[1]}\nNome: ${match[2]}\nData: ${match[3]}\nValor: ${match[4]}`;

    // Adiciona observação se existir
    if (match[5]) {
      responseMessage += `\nObservação: ${match[5]}`;
    }
  }
  // Verificação para aumento de limite
  else if (aumentoLimitePattern.test(normalizedBody)) {
    const match = normalizedBody.match(aumentoLimitePattern);
    if (!match) return { responseMessage: 'Erro ao processar mensagem.', messageData: {} };

    messageData = {
      tipo: 'Aumento de Limite',
      cod: match[1],
      nome: match[2].trim(),
      data: "-",
      coo: "-",
      operadora: "-",
      ecf: "-",
      valor: match[3],
      email: match[4]
    };

    responseMessage = `Aumento de Limite:\n\nCod: ${match[1]}\nNome: ${match[2]}\nValor: ${match[3]}\nE-mail: ${match[4]}`;
  }
  // Verificação para adicionar situação 70
  else if (adicionarSituacao70Pattern.test(normalizedBody)) {
    const match = normalizedBody.match(adicionarSituacao70Pattern);
    if (!match) return { responseMessage: 'Erro ao processar mensagem.', messageData: {} };

    messageData = {
      tipo: 'Adicionar Situação 70',
      cod: match[1],
      nome: match[2].trim(),
      data: "-",
      coo: "-",
      operadora: "-",
      ecf: "-",
      valor: "-",
      email: "-"
    };

    responseMessage = `Adicionar Situação 70:\n\nCod: ${match[1]}\nNome: ${match[2]}`;
  }
  // Verificação para remover situação 70
  else if (removerSituacao70Pattern.test(normalizedBody)) {
    const match = normalizedBody.match(removerSituacao70Pattern);
    if (!match) return { responseMessage: 'Erro ao processar mensagem.', messageData: {} };

    messageData = {
      tipo: 'Remover Situação 70',
      cod: match[1],
      nome: match[2].trim(),
      data: "-",
      coo: "-",
      operadora: "-",
      ecf: "-",
      valor: "-",
      email: "-"
    };

    responseMessage = `Remover Situação 70:\n\nCod: ${match[1]}\nNome: ${match[2]}`;
  }
  else {
    responseMessage = 'Mensagem não reconhecida.';
    messageData = {};
  }

  return { responseMessage, messageData };
}

venom.create({
  session: 'my-session',
  headless: 'new',
  browserArgs: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage'
  ]
}).then(async (client) => {
  console.log('✅ Bot inicializado com sucesso!');

  const sheets = await authenticateGoogleSheets();  // Autenticar Google Sheets na inicialização
  const gruposBloqueados = ['120363220294330138@g.us']; // Lista de grupos que o bot NÃO deve ler

  client.onMessage(async (message) => {
    try {
      // Verifica se a mensagem veio de um grupo bloqueado
      if (message.isGroupMsg && gruposBloqueados.includes(message.from)) {
        return; // Sai da função sem processar
      }
      if (message.body) {
        console.log(`📩 Mensagem recebida de ${message.from}: ${message.body}`);

        // Obter ou atualizar informações do contato
        const contactName = await getOrUpdateContact(sheets, message.from);
        const userPhoneNumber = message.from;
        const { responseMessage, messageData } = parseMessage(message);


        //--------------------------------------------------------------------------------------------------------------------//
        //Ativar quando for testar                                                                                            //
        const groupId = '553499630454-1567631375@g.us';                                                                       //
        // Grupo Lançamento de Notas                                                                                          //
        //const groupId = '120363220294330138@g.us';                                                                          //
        //--------------------------------------------------------------------------------------------------------------------//



        if (messageData.tipo) {
          const registroId = Math.floor(100000 + Math.random() * 900000);
          client.sendText(message.from, `✅ Mensagem identificada, olá ${contactName}! Seu ID de registro é: #${registroId}`);

          // Determinar qual grupo deve receber a notificação com base no tipo
          let notificationGroupId = groupId;

          // Opcional: Se quiser direcionar os tipos de mensagem para grupos diferentes
          // if (messageData.tipo.includes('Situação 70')) {
          //     notificationGroupId = 'ID_DO_GRUPO_SITUACAO70@g.us';
          // }

          client.sendText(notificationGroupId, `📢 *Novo ${messageData.tipo} registrado por ${contactName}!* \n\n${responseMessage}`);

          // Opcional: Armazenar no Google Sheets
          // await storeMessageInSheet(sheets, messageData, contactName, registroId);
        } else {
          // Log de mensagens não reconhecidas
          console.log(`❓ Mensagem não reconhecida: ${message.body}`);

          // Mensagem de ajuda personalizada
          const helpMessage = `Olá, ${contactName}! 🤖 
  
  Parece que sua mensagem não corresponde aos formatos esperados. 
  
  Formatos válidos:
  1. Lançamento de Cupom Fiscal
  2. Lançamento de Notinha Branca
  3. Aumento de Limite
  4. Adicionar/Remover Situação 70
  
  Para ajuda, entre em contato: 343321-3147 📞`;

          client.sendText(message.from, helpMessage);
        }
      }
    } catch (error) {
      console.error('❌ Erro no processamento da mensagem:', error);
      // Adiciona tratamento de erro para enviar mensagem ao usuário
      client.sendText(message.from, 'Desculpe, ocorreu um erro no processamento da sua mensagem.');
    }
  });
}).catch((error) => {
  console.error('❌ Erro crítico ao criar o bot:', error);
});