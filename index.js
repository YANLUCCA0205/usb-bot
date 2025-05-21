require('dotenv').config();
const venom = require('venom-bot');
const { google } = require('googleapis');
const fs = require('fs');

const groupMembers = new Set(); // Armazena os membros do grupo autorizado

async function authenticateGoogleSheets() {
  const credentials = JSON.parse(
    fs.readFileSync('C:/Users/y.mota/USBY/usb-bot/locked/key.json', 'utf-8')
  );

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

// Função atualizada para verificar se o contato é membro do grupo
async function checkContact(phoneNumber, client) {
  try {
    // Primeiro verifica se é membro do grupo
    if (isAuthorizedMember(phoneNumber)) {
      // Aqui está o problema: estamos retornando apenas o número como nome
      // Vamos buscar o nome real do contato
      try {
        const contactInfo = await client.getContact(phoneNumber);
        const contactName = contactInfo.name || contactInfo.pushname || phoneNumber;
        return {
          name: contactName,
          authorized: true
        };
      } catch (contactError) {
        console.error('Erro ao buscar informações do contato:', contactError);
        return {
          name: phoneNumber,
          authorized: true
        };
      }
    }

    // Se não for membro do grupo, verifica se é um número autorizado manualmente
    const autorizadosManualmente = [
      "553432213147@c.us", // Adicione aqui números que devem ter acesso
      // Adicione outros números conforme necessário
    ];

    if (autorizadosManualmente.includes(phoneNumber)) {
      // Aqui também devemos buscar o nome do contato
      try {
        const contactInfo = await client.getContact(phoneNumber);
        const contactName = contactInfo.name || contactInfo.pushname || phoneNumber;
        return {
          name: contactName,
          authorized: true
        };
      } catch (contactError) {
        console.error('Erro ao buscar informações do contato:', contactError);
        return {
          name: phoneNumber,
          authorized: true
        };
      }
    }

    console.log(`🔒 Acesso negado para número não autorizado: ${phoneNumber}`);
    return {
      name: phoneNumber,
      authorized: false
    };
  } catch (error) {
    console.error('❌ Erro ao verificar contato:', error);
    return {
      name: phoneNumber,
      authorized: false,
      error: true
    };
  }
}

// Função para cadastrar um novo contato (a ser usada manualmente quando necessário)
async function addNewContact(sheets, phoneNumber, name = 'DELIVERY') {
  const sheetId = '18akn_Oi_2L2IakzW-2_JUy6I88JhPmCKHnrXWg-cLic';
  const range = 'Contatos!A:B'; // Apenas as colunas A e B para verificar contatos

  try {
    // Obter contatos existentes
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: range,
    });

    const existingContacts = response.data.values || [];
    const existingNumbers = existingContacts.map(contact => contact[1]); // Assume que o número está na coluna B

    // Verifica se o número já está cadastrado
    if (existingNumbers.includes(phoneNumber)) {
      console.log(`📌 O contato ${name} - ${phoneNumber} já está cadastrado.`);
      return false; // Não adiciona novamente
    }

    const newContact = [name, phoneNumber, new Date().toLocaleString()];

    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: 'Contatos!A:C',
      valueInputOption: 'USER_ENTERED',
      resource: { values: [newContact] },
    });

    console.log(`✅ Novo contato cadastrado: ${name} - ${phoneNumber}`);
    return true;
  } catch (error) {
    console.error('❌ Erro ao cadastrar novo contato:', error);
    return false;
  }
}

// Função para sincronizar membros do grupo com a lista de contatos autorizados
async function syncGroupMembers(client, sheets, notificationGroupId) {
  try {
    console.log(`🔄 Iniciando sincronização de membros do grupo ${notificationGroupId}...`);
    const participants = await client.getGroupMembers(notificationGroupId);

    if (!participants || participants.length === 0) {
      console.log('⚠️ Nenhum participante encontrado no grupo');
      return;
    }

    console.log(`📊 Total de participantes encontrados: ${participants.length}`);

    // Limpar set existente
    groupMembers.clear();

    // Adicionar todos os participantes ao set
    for (const participant of participants) {
      const memberNumber = participant.id.user + '@c.us';
      groupMembers.add(memberNumber);

      // Armazena mais detalhadamente as informações dos participantes para uso posterior
      const memberName = participant.name || participant.pushname || memberNumber;
      console.log(`👤 Membro adicionado: ${memberName} (${memberNumber})`);

      // Opcionalmente, você pode adicionar/atualizar na planilha também
      await addNewContact(sheets, memberNumber, memberName);
    }

    console.log(`✅ Sincronização concluída! ${groupMembers.size} membros autorizados.`);
  } catch (error) {
    console.error('❌ Erro ao sincronizar membros do grupo:', error);
    console.error('Detalhes do erro:', error.stack);
  }
}

// Função para verificar se um número está entre os membros do grupo
function isAuthorizedMember(phoneNumber) {
  console.log(`Verificando autorização para: ${phoneNumber}`);
  console.log(`Membros autorizados: ${Array.from(groupMembers)}`);
  return groupMembers.has(phoneNumber);
}

function parseMessage(message) {
  const normalizedBody = message.body.replace(/\s+/g, ' ').trim();

  const lancamentoNotaPattern = /Lançamento de Cupom Fiscal\s+Cod:\s*(\d+)\s+Nome:\s*(.+?)\s+Data:\s*(\d{2}\/\d{2}\/\d{4})\s+Coo:\s*(\d+)\s+Operadora:\s*(.+?)\s+Ecf:\s*(\d+)\s+Valor:\s*(R\$\s*[\d,.]+)(?:\s+Observação:\s*([\s\S]*))?/i;
  const lancamentoNotinhaPattern = /Lançamento de Notinha Branca\s+Cod:\s*(\d+)\s+Nome:\s*(.+?)\s+Data:\s*(\d{2}\/\d{2}\/\d{4})\s+Valor:\s*(R\$\s*[\d,.]+)(?:\s+Observação:\s*([\s\S]*))?/i;
  const aumentoLimitePattern = /Aumento de Limite\s+Cod:\s*(\d+)\s+Nome:\s*(.+?)\s+Valor:\s*(R\$\s*[\d,.]+)\s+E-mail:\s*([\w.+-]+@[\w-]+\.[a-zA-Z0-9-.]+)/i;
  const adicionarSituacao70Pattern = /Adicionar Situação 70\s+Cod:\s*(\d+)\s+Nome:\s*(.+)/i;
  const removerSituacao70Pattern = /Remover Situação 70\s+Cod:\s*(\d+)\s+Nome:\s*(.+)/i;

  let responseMessage = '';
  let messageData = {};

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
  } else if (lancamentoNotinhaPattern.test(normalizedBody)) {
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
  } else if (aumentoLimitePattern.test(normalizedBody)) {
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
  } else if (adicionarSituacao70Pattern.test(normalizedBody)) {
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
  } else if (removerSituacao70Pattern.test(normalizedBody)) {
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
  } else {
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

  // Inicializar Google Sheets
  const sheets = await authenticateGoogleSheets();

  // Variáveis globais
  const notificationGroupId = '120363220294330138@g.us'; // Grupo Lançamento de Notas
  const gruposBloqueados = [notificationGroupId]; // Grupos onde o bot NÃO processa mensagens
  const numeroDelivery = "553432213147"; // Número do delivery para encaminhamento

  // Sincronizar membros do grupo imediatamente após a inicialização
  await syncGroupMembers(client, sheets, notificationGroupId);

  // Configurar sincronização periódica (a cada 1 hora, por exemplo)
  setInterval(async () => {
    await syncGroupMembers(client, sheets, notificationGroupId);
  }, 3600000); // 1 hora em milissegundos

  // Atualização do manipulador de mensagens para corrigir o envio de vCard
  client.onMessage(async (message) => {
    try {
      // Verifica se a mensagem veio de um grupo bloqueado
      if (message.isGroupMsg && gruposBloqueados.includes(message.from)) {
        return; // Sai da função sem processar
      }

      if (message.body) {
        console.log(`📩 Mensagem recebida de ${message.from}: ${message.body}`);

        // Verificar se o contato é membro do grupo (autorizado)
        const contactInfo = await checkContact(message.from, client);

        // Se o contato não estiver autorizado, envia mensagem de redirecionamento
        if (!contactInfo.authorized) {
          console.log(`❗ Contato não autorizado: ${message.from}`);

          // Mensagem informando que não está autorizado
          await client.sendText(message.from,
            `Olá! Este número não está autorizado a utilizar este sistema. 😊\n\n` +
            `Se você está procurando pelo delivery do União Supermercados, por favor use o número oficial:`
          );

          // Método 1: Enviar vCard usando método correto da API atual
          try {
            const vcard = `BEGIN:VCARD
VERSION:3.0
FN:União Delivery
TEL;type=CELL;type=VOICE;waid=553433213147:+55 34 3321-3147
END:VCARD`;

            await client.sendVCard(
              message.from,  // destino
              vcard,         // conteúdo do vCard
              'União Delivery' // nome de exibição
            );
            console.log('✅ vCard enviado com sucesso (método 1)');
          } catch (vcardError) {
            console.error('❌ Erro ao enviar vCard (método 1):', vcardError);

            // Método 2: Alternativa - tentar com outra função da API
            try {
              await client.sendContactVcard(
                message.from,       // destino
                '553433213147@c.us', // contato (com @c.us)
                'União Delivery'    // nome de exibição
              );
              console.log('✅ vCard enviado com sucesso (método 2)');
            } catch (vcardError2) {
              console.error('❌ Erro ao enviar vCard (método 2):', vcardError2);

              // Método 3: Enviar apenas o contato como texto se tudo falhar
              await client.sendText(
                message.from,
                `Para delivery, adicione este contato: +55 34 3321-3147`
              );
              console.log('⚠️ Enviou apenas texto do contato como fallback');
            }
          }

          return; // Encerra o processamento da mensagem
        }

        // O restante do código permanece igual...
        const { responseMessage, messageData } = parseMessage(message);

        if (messageData.tipo) {
          const registroId = Math.floor(100000 + Math.random() * 900000);

          // Resposta mais humanizada com o nome do contato
          const saudacao = obterSaudacao();
          client.sendText(message.from,
            `✅ ${saudacao}, ${contactInfo.name}! Sua solicitação foi recebida com sucesso.\n\n` +
            `Seu ID de registro é: #${registroId}\n\n` +
            `Em breve nossa equipe irá processar seu pedido. Obrigado! 😊`
          );

          // Envia notificação para o grupo com informações mais detalhadas
          client.sendText(notificationGroupId,
            `📢 *Novo ${messageData.tipo} registrado!* \n\n` +
            `👤 *Solicitante:* ${contactInfo.name}\n` +
            `🆔 *ID do Registro:* #${registroId}\n\n` +
            `${responseMessage}`
          );

          // Opcional: Armazenar no Google Sheets
          // await storeMessageInSheet(sheets, messageData, contactInfo.name, registroId);
        } else {
          // Log de mensagens não reconhecidas
          console.log(`❓ Mensagem não reconhecida: ${message.body}`);

          // Mensagem de ajuda personalizada e mais amigável
          const saudacao = obterSaudacao();
          const helpMessage = `${saudacao}, ${contactInfo.name}! 🤖 \n\n` +
            `Parece que sua mensagem não está no formato que consigo processar. \n\n` +
            `Para que eu possa ajudar, envie sua solicitação em um dos seguintes formatos:\n\n` +
            `📝 *Lançamento de Cupom Fiscal*\n` +
            `📝 *Lançamento de Notinha Branca*\n` +
            `📈 *Aumento de Limite*\n` +
            `🔄 *Adicionar/Remover Situação 70*\n\n` +
            `Precisa de mais ajuda? Entre em contato com o Yan: (34) 99963-0454 📞`;

          client.sendText(message.from, helpMessage);
        }
      }
    } catch (error) {
      console.error('❌ Erro no processamento da mensagem:', error);
      // Adiciona tratamento de erro para enviar mensagem ao usuário
      client.sendText(message.from, 'Desculpe, ocorreu um erro no processamento da sua mensagem. Por favor, tente novamente mais tarde ou contate nosso suporte.');
    }
  });
}).catch((error) => {
  console.error('❌ Erro crítico ao criar o bot:', error);
});

// Função para obter saudação de acordo com o horário
function obterSaudacao() {
  const hora = new Date().getHours();

  if (hora >= 5 && hora < 12) {
    return "Bom dia";
  } else if (hora >= 12 && hora < 18) {
    return "Boa tarde";
  } else {
    return "Boa noite";
  }
}
