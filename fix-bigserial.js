/**
 * Fix BigSerial script for Prisma migrations
 *
 * This script replaces "bigserial" with "int8" and adds a default sequence
 * in the generated migration SQL files, which resolves compatibility issues
 * with certain PostgreSQL configurations.
 */

const fs = require('fs');
const path = require('path');

// Utility to find the latest migration directory
function getLatestMigration() {
  const migrationsDir = path.join(__dirname, 'prisma', 'migrations');

  try {
    const migrations = fs
      .readdirSync(migrationsDir)
      .filter(dir => dir.match(/^\d{14}_/))
      .sort((a, b) => b.localeCompare(a));

    if (migrations.length === 0) {
      console.error('No migrations found in', migrationsDir);
      return null;
    }

    return path.join(migrationsDir, migrations[0]);
  } catch (error) {
    console.error('Error finding migrations:', error.message);
    return null;
  }
}

// Replace bigserial with int8 + sequence default
function fixMigrationSql() {
  const latestMigration = getLatestMigration();
  if (!latestMigration) return;

  const sqlPath = path.join(latestMigration, 'migration.sql');

  try {
    if (!fs.existsSync(sqlPath)) {
      console.error('No migration.sql file found in', latestMigration);
      return;
    }

    let sql = fs.readFileSync(sqlPath, 'utf8');

    // Replace "bigserial" with "int8"
    // and add sequence default for autoincremented fields
    const bigserialRegex = /(\w+)\s+bigserial/g;
    const matches = Array.from(sql.matchAll(bigserialRegex));

    if (matches.length === 0) {
      console.log('No bigserial fields found in the migration.');
      return;
    }

    // Process each bigserial field
    matches.forEach(match => {
      const fieldName = match[1];
      const tableName = findTableName(sql, match.index);

      if (!tableName) {
        console.warn(`Could not determine table name for field ${fieldName}`);
        return;
      }

      // Replace bigserial with int8 and add sequence
      const sequenceName = `${tableName}_${fieldName}_seq`;
      const replacement = `${fieldName} int8 NOT NULL DEFAULT nextval('${sequenceName}'::regclass)`;

      // Add sequence creation before the CREATE TABLE statement
      const tableCreationIndex = sql.indexOf(`CREATE TABLE "${tableName}"`);
      if (tableCreationIndex !== -1) {
        const sequenceCreation = `CREATE SEQUENCE IF NOT EXISTS "${sequenceName}";\n`;
        sql = sql.slice(0, tableCreationIndex) + sequenceCreation + sql.slice(tableCreationIndex);
      }

      // Replace the bigserial definition
      sql = sql.replace(`${fieldName} bigserial`, replacement);
    });

    // Write the fixed SQL back to the file
    fs.writeFileSync(sqlPath, sql);
    console.log(`✅ Successfully fixed bigserial issues in ${sqlPath}`);
    console.log(`Modified ${matches.length} bigserial fields.`);
  } catch (error) {
    console.error('Error fixing migration SQL:', error.message);
  }
}

// Helper function to find the table name based on the position of a field
function findTableName(sql, position) {
  // Find the CREATE TABLE statement that contains this position
  const tableStatements = sql.split(/CREATE TABLE|ALTER TABLE/).slice(1);

  for (let i = 0; i < tableStatements.length; i++) {
    const startPos = sql.indexOf(
      tableStatements[i],
      i === 0 ? 0 : sql.indexOf(tableStatements[i - 1]) + tableStatements[i - 1].length,
    );
    const endPos = startPos + tableStatements[i].length;

    if (position > startPos && position < endPos) {
      // Extract table name from the statement
      const tableNameMatch = tableStatements[i].match(/^\s*"([^"]+)"/);
      return tableNameMatch ? tableNameMatch[1] : null;
    }
  }

  return null;
}

// Run the fix
fixMigrationSql();
