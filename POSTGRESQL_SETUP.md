# PostgreSQL setup on PC-SERVER

PostgreSQL must be installed and configured on `PC-SERVER` before switching the application from SQLite.

## 1. Install and expose PostgreSQL

1. Install PostgreSQL 16 or newer on `PC-SERVER` and keep port `5432`.
2. In `postgresql.conf`, set:

   ```conf
   listen_addresses = '*'
   ```

3. In `pg_hba.conf`, allow only the application networks:

   ```conf
   host mainproject mainproject_app 192.168.8.0/24 scram-sha-256
   host mainproject mainproject_app 169.254.0.0/16 scram-sha-256
   ```

4. Restart the PostgreSQL service.
5. Run this in an elevated PowerShell window on `PC-SERVER`:

   ```powershell
   New-NetFirewallRule -DisplayName "MainProject PostgreSQL" -Direction Inbound -Protocol TCP -LocalPort 5432 -Action Allow -Profile Private
   ```

## 2. Create the application database

Open `psql` as the PostgreSQL administrator and choose a strong application password:

```sql
CREATE ROLE mainproject_app LOGIN PASSWORD 'REPLACE_WITH_A_STRONG_PASSWORD';
CREATE DATABASE mainproject OWNER mainproject_app ENCODING 'UTF8';
```

Do not store the real password in Git.

## 3. Configure and migrate

Create `.env` from `.env.example`, then set:

```dotenv
DB_CLIENT=postgres
PGHOST=PC-SERVER
PGPORT=5432
PGDATABASE=mainproject
PGUSER=mainproject_app
PGPASSWORD=REPLACE_WITH_A_STRONG_PASSWORD
SQLITE_SOURCE_PATH=\\PC-SERVER\Database\database.db
```

Before the first application start, run once from the project directory:

```powershell
npm run db:migrate:postgres
npm start
```

The migration reads SQLite without modifying it and copies all tables inside one PostgreSQL transaction. It refuses to replace existing PostgreSQL tables unless `npm run db:migrate:postgres:force` is explicitly used.

## 4. Verify from another device

```powershell
Test-NetConnection PC-SERVER -Port 5432
Invoke-RestMethod http://PC-SERVER:5000/api/health
```

The health response must show `"status": "ok"` and `"databaseProvider": "postgres"`.

Create backups with:

```powershell
npm run db:backup:postgres
```