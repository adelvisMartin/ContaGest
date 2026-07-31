import { BackendApi } from './backendApi.js';

const isStoragePath = (value) => Boolean(value && !/^https?:|^data:|^blob:/i.test(String(value)));

function fileToDataUrl(file, { maxBytes = 3 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    if (!(file instanceof File)) return reject(new Error('Selecciona una imagen válida.'));
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return reject(new Error('Usa una imagen JPEG, PNG o WebP.'));
    if (file.size > maxBytes) return reject(new Error('La imagen no debe superar 3 MB.'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(file);
  });
}

async function signPaths(paths, expiresIn = 3600) {
  const unique = [...new Set(paths.filter(isStoragePath))];
  if (!unique.length) return new Map();
  const results = await BackendApi.post('/api/v1/media/sign', { paths: unique, expiresIn });
  return new Map((results || []).filter((item) => item.signedUrl).map((item) => [item.path, item.signedUrl]));
}

export const MediaService = {
  fileToDataUrl,
  async upload({ entityType, entityId, dataUrl, alt = '' }) {
    return BackendApi.post('/api/v1/media/upload', { entityType, entityId, dataUrl, alt });
  },
  signPaths,
  async signRecords(records = [], field = 'photoUrl') {
    const signed = await signPaths(records.map((record) => record?.[field]));
    return records.map((record) => {
      const path = record?.[field];
      if (!isStoragePath(path)) return record;
      return { ...record, photoPath: path, [field]: signed.get(path) || '' };
    });
  },
  async remove(path) {
    return BackendApi.request('/media', { method: 'DELETE', body: { path } });
  }
};
