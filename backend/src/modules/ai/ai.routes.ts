import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, ok } from '../../shared/http.js';
import { requireTenant, requirePermission } from '../../shared/middleware/context.js';

const router = Router();
router.use(requireTenant);

const chatSchema = z.object({
  message: z.string().min(1).max(4000),
  context: z.record(z.string(), z.unknown()).optional(),
  history: z.array(z.record(z.string(), z.unknown())).optional()
});

router.post('/chat', requirePermission('reports.view'), asyncHandler(async (req, res) => {
  const body = chatSchema.parse(req.body || {});
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return ok(res, {
      answer: `Modo local: revisa "${body.context?.route || 'el módulo actual'}". Prioriza pedidos activos, stock crítico, caja y notificaciones pendientes. Configura OPENAI_API_KEY para respuestas generativas.`,
      suggestions: ['Pedidos retrasados', 'Stock bajo', 'Auditoría rápida']
    });
  }
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-5.1-mini',
      input: [
        { role: 'system', content: 'Eres el asistente operativo de ContaGest-VE. Responde breve, accionable y con foco ERP/ventas/inventario/contabilidad.' },
        { role: 'user', content: `Contexto: ${JSON.stringify(body.context || {})}\nPregunta: ${body.message}` }
      ]
    })
  });
  const data: any = await response.json();
  const answer = data.output_text || data.output?.flatMap((o: any) => o.content || []).map((c: any) => c.text || '').join('\n') || 'Respuesta generada sin texto.';
  ok(res, { answer, rawId: data.id });
}));

export default router;
