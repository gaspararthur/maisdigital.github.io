const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const root = path.join(__dirname, '..');
const frontendPath = path.join(root, 'frontend');
const leadsFile = path.join(__dirname, 'data', 'leads.jsonl');

app.use(express.json());
app.use(express.static(frontendPath));

app.post('/api/leads', (req, res) => {
  const { name, phone, business, plan } = req.body || {};

  if (!name || !phone) {
    return res.status(400).json({ ok: false, message: 'Nome e WhatsApp são obrigatórios.' });
  }

  const lead = {
    name: String(name).trim(),
    phone: String(phone).trim(),
    business: String(business || '').trim(),
    plan: String(plan || '').trim(),
    createdAt: new Date().toISOString()
  };

  fs.mkdirSync(path.dirname(leadsFile), { recursive: true });
  fs.appendFileSync(leadsFile, JSON.stringify(lead) + '\n', 'utf8');

  return res.status(201).json({ ok: true, message: 'Lead recebido com sucesso.' });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Mais Digital rodando em http://localhost:${PORT}`);
});
