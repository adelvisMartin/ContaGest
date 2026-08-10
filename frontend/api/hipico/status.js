export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  const required = ['HIPICO_SUPABASE_URL','HIPICO_SUPABASE_SERVICE_ROLE_KEY','HIPICO_OWNER_ID','HIPICO_META_VERIFY_TOKEN','HIPICO_META_APP_SECRET','HIPICO_META_ACCESS_TOKEN','HIPICO_META_PHONE_NUMBER_ID','HIPICO_INTERNAL_API_TOKEN'];
  const missing = required.filter((key) => !process.env[key]);
  return res.status(200).json({
    ok: true,
    service: 'hipico-control-operations',
    mode: missing.length ? 'offline_and_manual_ready' : 'cloud_connector_ready',
    cloudConnectorConfigured: missing.length === 0,
    missingConfigurationCount: missing.length
  });
}
