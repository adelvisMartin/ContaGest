export const PLAYWRIGHT_WEB_TRANSPORT = Object.freeze({
  id: 'playwright-web',
  label: 'WhatsApp Web linked-device bridge',
  official: false,
  implemented: true,
  sourceRead: true,
  labSend: true,
  groupSend: true,
  receipts: false,
  media: true
});

export const CLOUD_API_TRANSPORT = Object.freeze({
  id: 'cloud-api',
  label: 'WhatsApp Business Platform Cloud API',
  official: true,
  implemented: false,
  sourceRead: false,
  labSend: false,
  groupSend: false,
  receipts: true,
  media: true
});

export const TRANSPORT_CAPABILITIES = Object.freeze({
  [PLAYWRIGHT_WEB_TRANSPORT.id]: PLAYWRIGHT_WEB_TRANSPORT,
  [CLOUD_API_TRANSPORT.id]: CLOUD_API_TRANSPORT
});

export function resolveTransportCapabilities(adapter = PLAYWRIGHT_WEB_TRANSPORT.id) {
  const id = String(adapter || '').trim().toLowerCase();
  return TRANSPORT_CAPABILITIES[id] || Object.freeze({
    id: id || 'unknown',
    label: 'Unknown transport adapter',
    official: false,
    implemented: false,
    sourceRead: false,
    labSend: false,
    groupSend: false,
    receipts: false,
    media: false
  });
}

export function isKnownTransportAdapter(adapter) {
  const id = String(adapter || '').trim().toLowerCase();
  return Object.hasOwn(TRANSPORT_CAPABILITIES, id);
}
