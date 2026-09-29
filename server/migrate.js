import pgDatabase from './pg-database.js';

async function runMigrations() {
  console.log('Starting database migration...');
  
  try {
    await pgDatabase.initialize();
    console.log('Database migration completed successfully!');
    
    // Verify plans were seeded
    const plans = await pgDatabase.getAllPlans();
    console.log('Seeded plans:', plans.map(p => `${p.name} (${p.commission_rate * 100}% commission)`).join(', '));
    
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await pgDatabase.close();
  }
}

runMigrations();
