import express from 'express';
import cors from 'cors';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, 'data');
const app = express();
const PORT = process.env.PORT || 3030;
const RESOURCES = ['clients','inventory','history','taxes','ledger','banking','payroll','suppliers','purchases','sales','tasks','profile','admin','brand'];

app.use(cors());
app.use(express.json({ limit: '4mb' }));

async function readJson(name, fallback = []) {
  try { return JSON.parse(await fs.readFile(path.join(dataDir, `${name}.json`), 'utf8')); }
  catch { return fallback; }
}
async function writeJson(name, data) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(path.join(dataDir, `${name}.json`), JSON.stringify(data, null, 2));
}
const asArray = (value) => Array.isArray(value) ? value : [];
const getId = (item) => String(item?.id || '');
const newId = (prefix) => `${prefix}_${crypto.randomUUID().slice(0, 8)}`;

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'contagest-ve-enterprise-v7', resources: RESOURCES, at: new Date().toISOString() }));

RESOURCES.forEach((resource) => {
  app.get(`/api/${resource}`, async (req, res) => res.json(await readJson(resource, resource === 'profile' ? {} : [])));

  // Reemplaza el recurso completo. Ideal para sincronizar localStorage -> backend.
  app.post(`/api/${resource}`, async (req, res) => {
    await writeJson(resource, req.body);
    res.json({ ok: true, mode: 'replace', resource, count: Array.isArray(req.body) ? req.body.length : 1 });
  });

  // Crea un registro individual cuando el recurso es una colección.
  app.post(`/api/${resource}/item`, async (req, res) => {
    if (resource === 'profile' || resource === 'taxes') return res.status(400).json({ ok:false, message:'Recurso no soporta item CRUD.' });
    const current = asArray(await readJson(resource, []));
    const item = { id: req.body?.id || newId(resource), ...req.body };
    current.unshift(item);
    await writeJson(resource, current);
    res.json({ ok:true, mode:'create', resource, item });
  });

  app.put(`/api/${resource}/:id`, async (req, res) => {
    const current = asArray(await readJson(resource, []));
    const index = current.findIndex((item) => getId(item) === req.params.id);
    if (index < 0) return res.status(404).json({ ok:false, message:'Registro no encontrado' });
    current[index] = { ...current[index], ...req.body, id: current[index].id };
    await writeJson(resource, current);
    res.json({ ok:true, mode:'update', resource, item: current[index] });
  });

  app.delete(`/api/${resource}/:id`, async (req, res) => {
    const current = asArray(await readJson(resource, []));
    const next = current.filter((item) => getId(item) !== req.params.id);
    await writeJson(resource, next);
    res.json({ ok:true, mode:'delete', resource, deleted: current.length - next.length });
  });
});

app.get('/api/seniat/rif/:rif', async (req, res) => {
  const rif = String(req.params.rif || '').toUpperCase().replace(/[^JGVEP0-9]/g, '');
  if (!/^[JGVEP][0-9]{8,10}$/.test(rif)) return res.status(400).json({ ok:false, message:'Formato RIF inválido' });
  const lastDigit = Number(rif.slice(-1));
  const retentionRate = Number.isFinite(lastDigit) && lastDigit % 2 === 0 ? 75 : null;
  res.json({ ok:true, rif, name:null, retentionRate, manual_required: !retentionRate, official_url:'https://contribuyente.seniat.gob.ve' });
});

app.get('/api/regulatory/sources', (req, res) => res.json({ mode:'backend', sources:[
  { name:'SENIAT', kind:'Tributario', url:'https://seniat.gob.ve', status:'Referencial' },
  { name:'Gaceta Oficial', kind:'Normativa', url:'https://www.gacetaoficial.gob.ve', status:'Validación manual' },
  { name:'Imprenta Nacional', kind:'Normativa', url:'https://www.imprentanacional.gob.ve', status:'Referencial' },
  { name:'BCV', kind:'Tasa oficial', url:'https://www.bcv.org.ve', status:'Consulta diaria' }
]}));

app.get('/api/regulatory/updates', (req, res) => {
  const q = String(req.query.q || 'iva').toLowerCase();
  res.json({ mode:'backend', query:q, updates:[
    { date:new Date().toISOString().slice(0,10), source:'Monitor interno', title:`Revisión tributaria para ${q.toUpperCase()}`, summary:'Señal referencial. Validar providencia, Gaceta Oficial o portal oficial antes de aplicar.' },
    { date:new Date().toISOString().slice(0,10), source:'Checklist SENIAT', title:'Retenciones y contribuyentes especiales', summary:'Cuando el portal solicite captcha, la app debe permitir carga manual documentada.' }
  ] });
});

app.listen(PORT, () => console.log(`ContaGest-VE Enterprise v7 backend listening on http://localhost:${PORT}`));
