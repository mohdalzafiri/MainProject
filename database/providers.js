'use strict';

const { AsyncLocalStorage } = require('async_hooks');
const { restoreRowKeys, translatePostgresSql } = require('./sqlCompatibility');

function normalizeParameters(parameters) {
  return parameters.length === 1 && Array.isArray(parameters[0]) ? parameters[0] : parameters;
}

function createSqliteProvider(database) {
  return {
    client: 'sqlite',
    get open() {
      return database.open;
    },
    prepare(sql) {
      const statement = database.prepare(sql);
      return {
        all: async (...parameters) => statement.all(...normalizeParameters(parameters)),
        get: async (...parameters) => statement.get(...normalizeParameters(parameters)),
        run: async (...parameters) => statement.run(...normalizeParameters(parameters))
      };
    },
    transaction(callback) {
      return async (...parameters) => {
        database.exec('BEGIN IMMEDIATE');
        try {
          const result = await callback(...parameters);
          database.exec('COMMIT');
          return result;
        } catch (error) {
          if (database.inTransaction) database.exec('ROLLBACK');
          throw error;
        }
      };
    },
    async close() {
      if (database.open) database.close();
    }
  };
}

function createPostgresConfig(env = process.env) {
  if (env.DATABASE_URL) {
    return { connectionString: env.DATABASE_URL };
  }

  return {
    host: env.PGHOST,
    port: env.PGPORT ? Number(env.PGPORT) : 5432,
    database: env.PGDATABASE,
    user: env.PGUSER,
    password: env.PGPASSWORD
  };
}

function validatePostgresConfig(config) {
  if (config.connectionString) return;
  const missing = ['host', 'database', 'user', 'password'].filter((key) => !config[key]);
  if (missing.length) {
    throw new Error(`PostgreSQL configuration is incomplete. Missing: ${missing.join(', ')}`);
  }
}

function collectAliasKeys(sql) {
  const aliases = new Map();
  const pattern = /\bAS\s+"?([A-Za-z_][A-Za-z0-9_]*)"?/gi;
  let match;
  while ((match = pattern.exec(sql)) !== null) {
    aliases.set(match[1].toLowerCase(), match[1]);
  }
  return aliases;
}

function createPostgresProvider(options = {}) {
  const config = options.config || createPostgresConfig(options.env);
  validatePostgresConfig(config);
  const { Pool } = options.pool ? { Pool: null } : require('pg');
  const pool = options.pool || new Pool(config);
  const transactionStorage = new AsyncLocalStorage();
  const columnKeyMap = new Map();

  function executor() {
    return transactionStorage.getStore() || pool;
  }

  function mapRows(result, sql) {
    const keyMap = new Map();
    (result.fields || []).forEach((field) => {
      const sourceKey = `${field.tableID}:${field.columnID}`;
      const jsKey = columnKeyMap.get(sourceKey);
      if (jsKey) keyMap.set(field.name.toLowerCase(), jsKey);
    });
    collectAliasKeys(sql).forEach((value, key) => keyMap.set(key, value));
    return (result.rows || []).map((row) => restoreRowKeys(row, keyMap));
  }

  async function execute(sql, parameters, mode) {
    const pragmaMatch = String(sql).trim().match(/^PRAGMA\s+table_info\s*\(\s*"?([A-Za-z_][A-Za-z0-9_]*)"?\s*\)$/i);
    if (pragmaMatch) {
      const result = await executor().query(`
        SELECT
          columns.ordinal_position - 1 AS cid,
          columns.column_name AS name,
          columns.data_type AS type,
          CASE WHEN columns.is_nullable = 'NO' THEN 1 ELSE 0 END AS notnull,
          columns.column_default AS dflt_value,
          CASE WHEN constraints.constraint_type = 'PRIMARY KEY' THEN 1 ELSE 0 END AS pk
        FROM information_schema.columns AS columns
        LEFT JOIN information_schema.key_column_usage AS key_columns
          ON key_columns.table_schema = columns.table_schema
         AND key_columns.table_name = columns.table_name
         AND key_columns.column_name = columns.column_name
        LEFT JOIN information_schema.table_constraints AS constraints
          ON constraints.constraint_schema = key_columns.constraint_schema
         AND constraints.constraint_name = key_columns.constraint_name
         AND constraints.constraint_type = 'PRIMARY KEY'
        WHERE columns.table_schema = 'public' AND columns.table_name = $1
        ORDER BY columns.ordinal_position
      `, [pragmaMatch[1].toLowerCase()]);
      return mode === 'get' ? result.rows[0] : result.rows;
    }

    const translatedSql = translatePostgresSql(sql);
    const values = normalizeParameters(parameters);
    let querySql = translatedSql;
    const isInsert = /^\s*INSERT\b/i.test(querySql);
    if (mode === 'run' && isInsert && !/\bRETURNING\b/i.test(querySql)) {
      querySql = `${querySql.replace(/;\s*$/, '')} RETURNING id`;
    }

    const result = await executor().query(querySql, values);
    const rows = mapRows(result, sql);
    if (mode === 'all') return rows;
    if (mode === 'get') return rows[0];
    return {
      changes: result.rowCount || 0,
      lastInsertRowid: rows[0]?.ID ?? rows[0]?.id ?? null
    };
  }

  return {
    client: 'postgres',
    get open() {
      return true;
    },
    async initialize() {
      await pool.query('SELECT 1');
      const metadataExists = await pool.query(`
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'app_column_keys'
      `);
      if (!metadataExists.rowCount) {
        throw new Error('PostgreSQL schema is not initialized. Run npm run db:migrate:postgres first.');
      }
      const metadata = await pool.query(`
        SELECT classes.oid AS table_oid, attributes.attnum AS column_number, keys.js_key
        FROM app_column_keys AS keys
        JOIN pg_namespace AS namespaces ON namespaces.nspname = 'public'
        JOIN pg_class AS classes
          ON classes.relnamespace = namespaces.oid AND classes.relname = keys.table_name
        JOIN pg_attribute AS attributes
          ON attributes.attrelid = classes.oid AND attributes.attname = keys.column_name
      `);
      metadata.rows.forEach((row) => columnKeyMap.set(`${row.table_oid}:${row.column_number}`, row.js_key));
    },
    prepare(sql) {
      return {
        all: (...parameters) => execute(sql, parameters, 'all'),
        get: (...parameters) => execute(sql, parameters, 'get'),
        run: (...parameters) => execute(sql, parameters, 'run')
      };
    },
    transaction(callback) {
      return async (...parameters) => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const result = await transactionStorage.run(client, () => callback(...parameters));
          await client.query('COMMIT');
          return result;
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      };
    },
    async close() {
      await pool.end();
    }
  };
}

module.exports = {
  createPostgresConfig,
  createPostgresProvider,
  createSqliteProvider,
  normalizeParameters,
  validatePostgresConfig
};