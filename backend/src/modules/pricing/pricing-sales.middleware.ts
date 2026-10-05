import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../../shared/http.js';
import { resolveCanonicalPrice } from './pricing.service.js';

export async function enforceCanonicalSalesPricing(req: Request, _res: Response, next: NextFunction) {
  try {
    if (req.method !== 'POST' || req.path !== '/sales') return next();
    const context = (req as any).context as { tenantId?: string } | undefined;
    if (!context?.tenantId) return next(new HttpError(401, 'No hay tenant activo para resolver precios.'));

    const body = req.body as Record<string, any> | undefined;
    if (!body || !Array.isArray(body.lines)) return next();
    const documentCurrency = String(body.currency || 'VES').trim().toUpperCase();
    const instant = body.issueDate ? new Date(body.issueDate) : new Date();
    if (Number.isNaN(instant.getTime())) return next(new HttpError(422, 'issueDate inválido para resolver pricing.'));
    if (!body.issueDate) body.issueDate = instant.toISOString();

    body.lines = await Promise.all(body.lines.map(async (line: any) => {
      if (!line?.productId) return line;
      const resolved = await resolveCanonicalPrice({
        tenantId: context.tenantId!,
        targetType: 'product',
        targetId: String(line.productId),
        documentCurrency,
        instant,
        businessLocationId: null,
        fxRate: body.exchangeRate,
        fxRateDate: body.exchangeRateDate ? new Date(body.exchangeRateDate) : undefined,
        fxRateSource: body.exchangeRateSource,
      });
      return {
        ...line,
        unitPrice: resolved.amount.toFixed(2),
      };
    }));
    next();
  } catch (error) {
    next(error);
  }
}
