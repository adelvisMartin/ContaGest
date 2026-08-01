import { BackendApi } from './backendApi.js';
import { SupabaseSyncService } from './supabaseSyncService.js';

const normalize = (purchase) => SupabaseSyncService.mappers.normalizePurchase(purchase);

export const PurchaseOperationsService = {
  async deleteDraft(id) {
    return BackendApi.remove('purchases', id);
  },

  async cancel(id, reason = 'Anulación solicitada desde la interfaz de Compras') {
    const result = await BackendApi.request(`/purchases/${encodeURIComponent(id)}/cancel`, {
      method: 'PATCH',
      body: { reason }
    });
    return {
      ...result,
      purchase: normalize(result.purchase)
    };
  }
};
