export const SUPPORTED_SCHEMA_VERSION = 1;

export async function assertSupportedSchema(pool) {
  const [rows] = await pool.execute('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1');
  if (!rows.length || Number(rows[0].version) !== SUPPORTED_SCHEMA_VERSION) {
    const error = new Error('MySQL schema is not initialized or has an unsupported version');
    error.code = 'SCHEMA_VERSION_UNSUPPORTED';
    throw error;
  }
}
