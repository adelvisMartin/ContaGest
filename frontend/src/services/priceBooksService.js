import { BackendApi } from './backendApi.js';

export const PriceBooksService={
  list(){return BackendApi.get('/price-books');},
  create(data){return BackendApi.post('/price-books',data);},
  update(id,data){return BackendApi.patch(`/price-books/${encodeURIComponent(id)}`,data);},
  entries(id){return BackendApi.get(`/price-books/${encodeURIComponent(id)}/entries`);},
  addEntry(id,data){return BackendApi.post(`/price-books/${encodeURIComponent(id)}/entries`,data);},
  preview(data){return BackendApi.post('/price-books/preview/resolve',data);},
  products(){return BackendApi.get('/products?take=500');},
  async services(){
    const take=100,services=[];
    for(let skip=0;skip<10000;skip+=take){
      const page=await BackendApi.get(`/price-books/services?take=${take}&skip=${skip}`);
      if(!Array.isArray(page)||page.length>take)throw new Error('Respuesta de catálogo de servicios inválida.');
      services.push(...page);
      if(page.length<take)return services;
    }
    throw new Error('Catálogo de servicios demasiado amplio para la selección actual.');
  }
};
