import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import express from "express";
import { readFileSync, existsSync } from "fs";
import pino from "pino";

/* ── Config ─────────────────────────────────────────────────────────── */
const PORT = 3001;
const logger = pino({ level: "silent" }); // muda para "info" se quiser logs

let sock = null;
let connected = false;
let qrCode = null;

/* ── Contacts ───────────────────────────────────────────────────────── */
function loadContacts() {
  try {
    const raw = JSON.parse(readFileSync("./contacts.json", "utf8"));
    // Remove a chave "comentário"
    const { comentário: _, ...contacts } = raw;
    return contacts;
  } catch {
    return {};
  }
}

function resolvePhone(input, contacts) {
  const lower = input.toLowerCase().trim();
  // Tenta por nome nos contatos
  const match = Object.entries(contacts).find(([name]) =>
    name.toLowerCase() === lower || lower.includes(name.toLowerCase())
  );
  if (match) return match[1];
  // Assume que é um número direto
  return input.replace(/\D/g, "");
}

/* ── WhatsApp connection ─────────────────────────────────────────────── */
async function connect() {
  const { state, saveCreds } = await useMultiFileAuthState("./auth");
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    logger,
    auth: state,
    printQRInTerminal: true,
    browser: ["Jarvis", "Chrome", "1.0.0"],
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      qrCode = qr;
      console.log("\n[Jarvis WhatsApp] Escaneie o QR code acima com seu celular.\n");
    }

    if (connection === "open") {
      connected = true;
      qrCode = null;
      console.log("[Jarvis WhatsApp] Conectado com sucesso!");
    }

    if (connection === "close") {
      connected = false;
      const code = lastDisconnect?.error instanceof Boom
        ? lastDisconnect.error.output.statusCode
        : null;

      if (code === DisconnectReason.loggedOut) {
        console.log("[Jarvis WhatsApp] Desconectado. Delete a pasta auth/ e reinicie.");
      } else {
        console.log("[Jarvis WhatsApp] Reconectando...");
        setTimeout(connect, 3000);
      }
    }
  });
}

/* ── Express API ─────────────────────────────────────────────────────── */
const app = express();
app.use(express.json());

app.get("/status", (req, res) => {
  res.json({ connected, hasQr: !!qrCode });
});

app.post("/send", async (req, res) => {
  const { to, message } = req.body;

  if (!connected || !sock) {
    return res.json({ error: "WhatsApp não conectado. Verifique o QR code no terminal." });
  }
  if (!to || !message) {
    return res.json({ error: "Parâmetros 'to' e 'message' são obrigatórios." });
  }

  const contacts = loadContacts();
  const phone = resolvePhone(to, contacts);

  if (!phone || phone.length < 8) {
    return res.json({ error: `Contato "${to}" não encontrado. Verifique contacts.json.` });
  }

  const jid = `${phone}@s.whatsapp.net`;

  try {
    await sock.sendMessage(jid, { text: message });
    res.json({ ok: true, to: phone });
  } catch (err) {
    res.json({ error: err?.message ?? "Erro ao enviar mensagem." });
  }
});

app.listen(PORT, () => {
  console.log(`[Jarvis WhatsApp] Serviço rodando na porta ${PORT}`);
  if (!existsSync("./auth/creds.json")) {
    console.log("[Jarvis WhatsApp] Primeira execução — aguarde o QR code aparecer acima.");
  }
  connect();
});
