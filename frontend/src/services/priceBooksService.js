import { BackendApi } from './backendApi.js';

export const PriceBooksService={
  list(){return BackendApi.get('/price-books');},
  create(data){return BackendApi.post('/price-books',data);},
  update(id,data){return BackendApi.patch(`/price-books/${encodeURIComponent(id)}`,data);},
  entries(id){return BackendApi.get(`/price-books/${encodeURIComponent(id)}/entries`);},
  addEntry(id,data){return BackendApi.post(`/price-books/${encodeURIComponent(id)}/entries`,data);},
  preview(data){return BackendApi.post('/price-books/preview/resolve',data);}
};
