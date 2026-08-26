import 'dotenv/config';
import pool from '../src/config/db.js';
import {
  encryptMessageContent,
  isEncryptedMessageContent,
} from '../src/services/messageCryptoService.js';

const batchSize = Number(process.env.MESSAGE_ENCRYPTION_BATCH_SIZE || 100);
let migrated = 0;

try {
  while (true) {
    const result = await pool.query(
      `SELECT id, content
         FROM messages
        WHERE content NOT LIKE 'aphenas:v1:%'
        ORDER BY id ASC
        LIMIT $1`,
      [batchSize]
    );
    if (result.rowCount === 0) break;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const row of result.rows) {
        if (isEncryptedMessageContent(row.content)) continue;
        await client.query(
          `UPDATE messages SET content = $1 WHERE id = $2`,
          [encryptMessageContent(row.content), row.id]
        );
        migrated += 1;
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  console.log(`Encrypted ${migrated} legacy message rows.`);
} finally {
  await pool.end();
}
