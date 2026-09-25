import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, ok } from '../../shared/http.js';
import { requireTenant, requirePermission } from '../../shared/middleware/context.js';
import { UnifiedAgentRuntime } from '../../shared/agents/unified-agent-runtime.js';
import { writeAudit } from '../../shared/services/audit.service.js';
import { logger } from '../../shared/observability/logger.js';

const router = Router();
router.use(requireTenant);

const historyItemSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(6000)
});

const chatSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  context: z.record(z.string(), z.unknown()).optional(),
  history: z.array(historyItemSchema).max(30).optional(),
  conversationId: z.string().uuid().optional()
});

type OperationalSnapshot = {
  tenant: { name: string; rif: string; plan: string; status: string } | null;
  clients: number;
  products: number;
  lowStock: Array<{ name: string; sku: string; stock: number; minStock: number }>;
  sales: { total: number; open: number; paid: number; overdue: number; amount: number };
  purchases: { total: number; open: number; amount: number };
  ledger: { unposted: number };
  bankAccounts: number;
};

const asNumber = (value: unknown) => Number(String(value ?? 0)) || 0;

async function loadOperationalSnapshot(tenantId: string): Promise<OperationalSnapshot> {
  const [tenant, clients, products, salesRows, purchaseRows, unposted, bankAccounts] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, rif: true, plan: true, status: true } }),
    prisma.client.count({ where: { tenantId, active: true } }),
    prisma.product.findMany({
      where: { tenantId, active: true },
      select: { name: true, sku: true, stock: true, minStock: true },
      orderBy: { updatedAt: 'desc' },
      take: 500
    }),
    prisma.salesInvoice.findMany({
      where: { tenantId },
      select: { status: true, total: true, issueDate: true },
      orderBy: { issueDate: 'desc' },
      take: 500
    }),
    prisma.purchaseInvoice.findMany({
      where: { tenantId },
      select: { status: true, total: true },
      orderBy: { issueDate: 'desc' },
      take: 500
    }),
    prisma.ledgerEntry.count({ where: { tenantId, posted: false } }),
    prisma.bankAccount.count({ where: { tenantId, active: true } })
  ]);

  const lowStock = products
    .map((item) => ({ name: item.name, sku: item.sku, stock: asNumber(item.stock), minStock: asNumber(item.minStock) }))
    .filter((item) => item.stock <= item.minStock)
    .sort((a, b) => (a.stock - a.minStock) - (b.stock - b.minStock))
    .slice(0, 12);

  const overdueBoundary = Date.now() - 30 * 86400000;
  const activeSales = salesRows.filter((row) => !['paid', 'cancelled'].includes(String(row.status)));
  const activePurchases = purchaseRows.filter((row) => !['paid', 'cancelled'].includes(String(row.status)));

  return {
    tenant: tenant ? { ...tenant, status: String(tenant.status) } : null,
    clients,
    products: products.length,
    lowStock,
    sales: {
      total: salesRows.length,
      open: activeSales.length,
      paid: salesRows.filter((row) => String(row.status) === 'paid').length,
      overdue: activeSales.filter((row) => row.issueDate.getTime() < overdueBoundary).length,
      amount: salesRows.reduce((sum, row) => sum + asNumber(row.total), 0)
    },
    purchases: {
      total: purchaseRows.length,
      open: activePurchases.length,
      amount: purchaseRows.reduce((sum, row) => sum + asNumber(row.total), 0)
    },
    ledger: { unposted },
    bankAccounts
  };
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function operationalAnswer(message: string, snapshot: OperationalSnapshot) {
  const query = message.toLowerCase();
  const stockList = snapshot.lowStock.length
    ? snapshot.lowStock.slice(0, 5).map((item) => `${item.name} (${item.sku}): ${item.stock}/${item.minStock}`).join('; ')
    : 'No hay productos por debajo del mínimo en la muestra actual.';

  if (/inventario|stock|producto|kardex/.test(query)) {
    return `Inventario: ${snapshot.products} productos activos y ${snapshot.lowStock.length} alertas de stock. Prioridad: ${stockList}\n\nAcción recomendada: valida movimientos recientes, existencias reservadas y genera reposición para los productos con mayor déficit.`;
  }
  if (/venta|factura|cobrar|ingreso|cliente/.test(query)) {
    return `Ventas: ${snapshot.sales.total} documentos, ${snapshot.sales.open} abiertos, ${snapshot.sales.overdue} potencialmente vencidos y ${snapshot.sales.paid} pagados. Monto registrado: ${formatMoney(snapshot.sales.amount)}. Clientes activos: ${snapshot.clients}.\n\nAcción recomendada: revisa primero documentos abiertos con más de 30 días y confirma cobros antes de emitir nuevos créditos.`;
  }
  if (/compra|proveedor|pagar|egreso/.test(query)) {
    return `Compras: ${snapshot.purchases.total} documentos y ${snapshot.purchases.open} pendientes. Monto registrado: ${formatMoney(snapshot.purchases.amount)}.\n\nAcción recomendada: cruza obligaciones abiertas con disponibilidad bancaria y evita duplicar facturas por número de control.`;
  }
  if (/contab|libro|asiento|balance|cierre/.test(query)) {
    return `Contabilidad: hay ${snapshot.ledger.unposted} asientos sin contabilizar.\n\nAcción recomendada: valida débitos y créditos, origen documental, período fiscal y publica únicamente los asientos balanceados.`;
  }
  if (/banco|caja|concili/.test(query)) {
    return `Tesorería: ${snapshot.bankAccounts} cuentas bancarias activas.\n\nAcción recomendada: concilia movimientos pendientes, confirma referencias y evita registrar pagos sin documento de origen.`;
  }

  return `Auditoría rápida de ${snapshot.tenant?.name || 'la empresa'}:\n• ${snapshot.lowStock.length} alertas de inventario.\n• ${snapshot.sales.open} ventas abiertas; ${snapshot.sales.overdue} con antigüedad mayor a 30 días.\n• ${snapshot.purchases.open} compras pendientes.\n• ${snapshot.ledger.unposted} asientos sin publicar.\n\nPrioridad sugerida: 1) documentos vencidos, 2) stock crítico, 3) asientos pendientes y 4) conciliación bancaria.`;
}

function extractResponseText(data: any) {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) return data.output_text.trim();
  const content = Array.isArray(data?.output)
    ? data.output.flatMap((item: any) => Array.isArray(item?.content) ? item.content : [])
    : [];
  return content.map((item: any) => item?.text || item?.output_text || '').filter(Boolean).join('\n').trim();
}

function openAiTimeoutMs() {
  const parsed = Number(process.env.OPENAI_REQUEST_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed >= 100 && parsed <= 60_000 ? Math.round(parsed) : 18_000;
}

async function askOpenAi(message: string, history: Array<{ role: 'user' | 'assistant'; content: string }>, snapshot: OperationalSnapshot) {
  const key = String(process.env.OPENAI_API_KEY || '').trim();
  if (!key) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), openAiTimeoutMs());
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-5-mini',
        store: false,
        max_output_tokens: 700,
        input: [
          {
            role: 'system',
            content: [{
              type: 'input_text',
              text: 'Eres el asistente operativo de ContaGest-VE. Analiza únicamente el tenant suministrado. Responde en español, de forma profesional, breve y accionable. No inventes datos, no reveles secretos y distingue hechos de recomendaciones.'
            }]
          },
          ...history.slice(-8).map((item) => ({ role: item.role, content: [{ type: 'input_text', text: item.content }] })),
          {
            role: 'user',
            content: [{ type: 'input_text', text: `Datos operativos actuales: ${JSON.stringify(snapshot)}\n\nConsulta: ${message}` }]
          }
        ]
      })
    });
    const data: any = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error?.message || `Proveedor IA respondió HTTP ${response.status}`);
    const answer = extractResponseText(data);
    return answer ? { answer, rawId: data.id || null } : null;
  } finally {
    clearTimeout(timer);
  }
}

type AssistantRuntimeInput = {
  tenantId: string;
  userId?: string;
  message: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
};

type AssistantRuntimeOutput = {
  answer: string;
  provider: 'openai' | 'contagest-operational';
  model: string;
  providerWarning: string | null;
  rawId: string | null;
};

export const ERP_ASSISTANT_RUNTIME_ID = 'contagest-erp-assistant-v1';

const assistantRuntime = new UnifiedAgentRuntime<AssistantRuntimeInput, OperationalSnapshot, AssistantRuntimeOutput>({
  runtimeId: ERP_ASSISTANT_RUNTIME_ID,
  contextBuilder: ({ tenantId }) => loadOperationalSnapshot(tenantId),
  decide: async ({ input, context }) => {
    let provider: AssistantRuntimeOutput['provider'] = 'contagest-operational';
    let rawId: string | null = null;
    let providerWarning: string | null = null;
    let answer = '';

    try {
      const generated = await askOpenAi(input.message, input.history, context);
      if (generated) {
        answer = generated.answer;
        rawId = generated.rawId;
        provider = 'openai';
      }
    } catch (error: any) {
      providerWarning = String(error?.message || 'Proveedor generativo no disponible.');
    }

    if (!answer) answer = operationalAnswer(input.message, context);
    return {
      intent: 'operational_assistance',
      confidence: 1,
      risk: 'safe',
      source: provider === 'openai' ? 'model' : 'rules',
      modelVersion: provider === 'openai' ? (process.env.OPENAI_MODEL || 'gpt-5-mini') : 'motor-operativo-local',
      tool: null,
      output: {
        answer,
        provider,
        model: provider === 'openai' ? (process.env.OPENAI_MODEL || 'gpt-5-mini') : 'motor-operativo-local',
        providerWarning,
        rawId
      }
    };
  },
  policy: () => ({
    disposition: 'SUGGEST',
    reason: 'READ_ONLY_ASSISTANT',
    autonomousAllowed: false,
    humanRequired: false
  }),
  audit: async (event) => {
    if (event.stage !== 'COMPLETE') return;
    await writeAudit({
      tenantId: event.trace.runtimeId ? undefined : undefined,
      action: 'agent.runtime.evaluate',
      entity: 'UnifiedAgentRuntime',
      after: {
        runtimeId: event.trace.runtimeId,
        mode: event.trace.mode,
        disposition: event.trace.disposition,
        reason: event.trace.reason,
        intent: event.trace.intent,
        risk: event.trace.risk,
        source: event.trace.source,
        toolName: event.trace.toolName,
        directEffectsApplied: event.trace.directEffectsApplied
      }
    });
  },
  metrics: (trace) => {
    logger.info({
      event: 'agent.runtime.complete',
      runtimeId: trace.runtimeId,
      mode: trace.mode,
      disposition: trace.disposition,
      reason: trace.reason,
      intent: trace.intent,
      source: trace.source,
      risk: trace.risk,
      toolName: trace.toolName,
      directEffectsApplied: trace.directEffectsApplied,
      durationMs: trace.durationMs
    }, 'agent runtime completed');
  }
});

async function persistConversation(params: {
  tenantId: string;
  userId?: string;
  conversationId?: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  message: string;
  answer: string;
}) {
  const messages = [...params.history, { role: 'user', content: params.message }, { role: 'assistant', content: params.answer }].slice(-40);
  if (params.conversationId) {
    const existing = await prisma.aiConversation.findFirst({ where: { id: params.conversationId, tenantId: params.tenantId } });
    if (existing) {
      const updated = await prisma.aiConversation.update({ where: { id: existing.id }, data: { messages: messages as any } });
      return updated.id;
    }
  }
  const created = await prisma.aiConversation.create({
    data: {
      tenantId: params.tenantId,
      userId: params.userId || null,
      title: params.message.slice(0, 90),
      messages: messages as any
    }
  });
  return created.id;
}

router.get('/status', requirePermission('reports.view'), asyncHandler(async (req, res) => {
  const ctx = (req as any).context;
  const snapshot = await loadOperationalSnapshot(ctx.tenantId);
  ok(res, {
    available: true,
    provider: process.env.OPENAI_API_KEY ? 'openai' : 'contagest-operational',
    model: process.env.OPENAI_API_KEY ? (process.env.OPENAI_MODEL || 'gpt-5-mini') : 'motor-operativo-local',
    snapshotAt: new Date().toISOString(),
    indicators: {
      lowStock: snapshot.lowStock.length,
      openSales: snapshot.sales.open,
      overdueSales: snapshot.sales.overdue,
      unpostedLedger: snapshot.ledger.unposted
    },
    runtime: {
      runtimeId: ERP_ASSISTANT_RUNTIME_ID,
      mode: 'ASSISTED',
      financialAuthority: false,
      directEffectsAllowed: false
    }
  });
}));

router.post('/chat', requirePermission('reports.view'), asyncHandler(async(req,res)=>{
  const body = chatSchema.parse(req.body || {});
  const ctx = (req as any).context;
  const history = body.history || [];
  const evaluation = await assistantRuntime.run({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    message: body.message,
    history
  }, 'ASSISTED');
  if (!evaluation.proposal) throw new Error('AGENT_RUNTIME_PROPOSAL_REQUIRED');
  const output = evaluation.proposal.output;

  const conversationId = await persistConversation({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    conversationId: body.conversationId,
    history,
    message: body.message,
    answer: output.answer
  });

  ok(res, {
    answer: output.answer,
    provider: output.provider,
    model: output.model,
    providerWarning: output.providerWarning,
    rawId: output.rawId,
    conversationId,
    snapshotAt: new Date().toISOString(),
    suggestions: ['Auditar ventas vencidas', 'Revisar stock crítico', 'Validar asientos pendientes', 'Examinar caja y bancos'],
    runtime: {
      runtimeId: evaluation.trace.runtimeId,
      mode: evaluation.trace.mode,
      disposition: evaluation.trace.disposition,
      reason: evaluation.trace.reason,
      humanRequired: evaluation.trace.humanRequired,
      directEffectsApplied: evaluation.trace.directEffectsApplied
    }
  });
}));

export default router;
