/**
 * Migration: Add 'status' column to the 'news' table in Supabase.
 * Run once: node migrate-news-status.js
 *
 * Requires SUPABASE_URL and SUPABASE_KEY env vars (or .env file).
 */
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function migrate() {
  console.log('Adding "status" column to news table...');

  // Use rpc to run raw SQL (requires the `moddatetime` or similar extension, or
  // use the Supabase dashboard SQL editor instead).
  // If your Supabase key is a service_role key, you can use the REST API to
  // alter the table. Otherwise, run this SQL directly in the Supabase SQL Editor:
  //
  //   ALTER TABLE news ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'approved';
  //   UPDATE news SET status = 'approved' WHERE status IS NULL;
  //

  // Attempt via a test insert/update to check if the column already exists
  const { data: sample, error: sampleErr } = await supabase
    .from('news')
    .select('status')
    .limit(1);

  if (sampleErr && sampleErr.message.includes('status')) {
    console.log('\n⚠️  The "status" column does not exist yet.');
    console.log('   Please run the following SQL in the Supabase SQL Editor:\n');
    console.log('   ALTER TABLE news ADD COLUMN IF NOT EXISTS status TEXT DEFAULT \'approved\';');
    console.log('   UPDATE news SET status = \'approved\' WHERE status IS NULL;\n');
    process.exit(1);
  }

  if (sample) {
    console.log('✅ The "status" column already exists. Checking for NULL values...');
    const { error: updateErr } = await supabase
      .from('news')
      .update({ status: 'approved' })
      .is('status', null);
    if (updateErr) {
      console.log('⚠️  Could not update NULL statuses:', updateErr.message);
    } else {
      console.log('✅ All existing news records now have status = "approved".');
    }
  }

  console.log('\nMigration complete.');
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
