/**
 * npm run migrate
 *
 * Applies database/schema.sql and verifies the connection.
 * Prefer running `bash database/setup.sh` directly for first-time setup.
 * This script is useful when you want to run migrations from Node
 * (e.g. in CI or Docker entrypoints).
 */
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const pool = require('../config/db');

const schemaPath = path.resolve(__dirname, '../../../database/schema.sql');

(async () => {
  try {
    await pool.query('SELECT 1');
    console.log('✅ Database connection OK.');

    if (fs.existsSync(schemaPath)) {
      const sql = fs.readFileSync(schemaPath, 'utf8');
      await pool.query(sql);
      console.log('✅ Schema applied from database/schema.sql');
    } else {
      console.warn('⚠️  database/schema.sql not found at:', schemaPath);
      console.warn('   Run: bash database/setup.sh');
    }

    console.log('\nDefault admin → username: admin   password: Admin@1234');
    console.log('Change the password before going to production.');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    if (err.message.includes('does not exist')) {
      console.error('   Hint: create the DB first →  psql -c "CREATE DATABASE attendance_db;"');
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
