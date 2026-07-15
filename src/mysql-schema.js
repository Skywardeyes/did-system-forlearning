export const MIN_SUPPORTED_SCHEMA_VERSION = 1;
export const SUPPORTED_SCHEMA_VERSION = 10;

export async function assertSupportedSchema(pool, { requiredVersion = MIN_SUPPORTED_SCHEMA_VERSION } = {}) {
  const [rows] = await pool.execute('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1');
  const version = Number(rows[0]?.version);
  if (!rows.length || version < Math.max(MIN_SUPPORTED_SCHEMA_VERSION, requiredVersion) || version > SUPPORTED_SCHEMA_VERSION) {
    const error = new Error('MySQL schema is not initialized or has an unsupported version');
    error.code = 'SCHEMA_VERSION_UNSUPPORTED';
    throw error;
  }
}
