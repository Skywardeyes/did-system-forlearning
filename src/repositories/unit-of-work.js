export class MySqlUnitOfWork {
  constructor(pool) { this.pool = pool; }

  async run(context, callback) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const result = await callback({ context, connection });
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}
