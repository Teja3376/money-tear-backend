import { createDataSource } from '@/database/data-source';

const VALID_COMMANDS = ['run', 'revert', 'show', 'diff'] as const;
type Command = (typeof VALID_COMMANDS)[number];

function parseCommand(argv: string[]): Command {
  const command = argv[0];
  if (!command || !(VALID_COMMANDS as readonly string[]).includes(command)) {
    throw new Error(
      `Usage: cli <${VALID_COMMANDS.join('|')}> (received: ${command ?? 'nothing'})`,
    );
  }
  return command as Command;
}

async function main(): Promise<void> {
  const command = parseCommand(process.argv.slice(2));
  const dataSource = createDataSource();

  await dataSource.initialize();
  try {
    switch (command) {
      case 'show': {
        const hasPending = await dataSource.showMigrations();
        console.log(hasPending ? 'Pending migrations exist.' : 'No pending migrations.');
        for (const migration of dataSource.migrations) {
          console.log(` - ${migration.name}`);
        }
        return;
      }

      case 'run': {
        const applied = await dataSource.runMigrations({ transaction: 'each' });
        if (applied.length === 0) {
          console.log('Already up to date. No migrations were applied.');
        } else {
          console.log(`Applied ${applied.length} migration(s):`);
          for (const migration of applied) {
            console.log(` - ${migration.name}`);
          }
        }
        return;
      }

      case 'revert': {
        await dataSource.undoLastMigration({ transaction: 'each' });
        console.log('Reverted the most recently applied migration.');
        return;
      }

      case 'diff': {
        const sqlInMemory = await dataSource.driver.createSchemaBuilder().log();
        if (sqlInMemory.upQueries.length === 0) {
          console.log('Schema is in sync with the entities. Nothing to apply.');
          return;
        }
        console.log('--- SQL that a migration would apply (review before running) ---');
        for (const query of sqlInMemory.upQueries) {
          console.log(query.query);
        }
        return;
      }
    }
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Migration command failed: ${message}`);
  process.exitCode = 1;
});
