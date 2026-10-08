import { Pool } from 'pg';

async function main() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }

  const pool = new Pool({ connectionString });

  try {
    await pool.query(
      `insert into topics (name)
       values ($1)
       on conflict (name) do nothing`,
      ['学习'],
    );
    console.log('Initialized the 学习 topic. No demo articles or tags were created.');
  } finally {
    await pool.end();
  }
}

await main();
