import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';

import { schema } from './schema';

const DATABASE_NAME = 'hevycoach.db';

// `enableChangeListener` is what makes drizzle's `useLiveQuery` re-run when a sync writes rows.
const sqlite = openDatabaseSync(DATABASE_NAME, { enableChangeListener: true });

// Both default to off in SQLite: WAL keeps a sync's writes from blocking reads, and without the
// foreign key pragma the `on delete cascade` clauses in the schema never fire.
sqlite.execSync('PRAGMA journal_mode = WAL;');
sqlite.execSync('PRAGMA foreign_keys = ON;');

export const db = drizzle(sqlite, { schema });
