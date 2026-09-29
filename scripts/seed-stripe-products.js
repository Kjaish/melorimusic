/**
 * Seed Stripe Products Script
 * 
 * This script creates Stripe products and prices for MELORI subscription plans,
 * then updates the local database with the Stripe price IDs.
 * 
 * Usage: node scripts/seed-stripe-products.js
 */

import 'dotenv/config';
import pg from 'pg';
import Stripe from 'stripe';

const { Pool } = pg;

async function getStripeClient() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? 'depl ' + process.env.WEB_REPL_RENEWAL
      : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found - run this script from within Replit');
  }

  const connectorName = 'stripe';
  const isProduction = process.env.REPLIT_DEPLOYMENT === '1';
  const targetEnvironment = isProduction ? 'production' : 'development';

  const url = new URL(`https://${hostname}/api/v2/connection`);
  url.searchParams.set('include_secrets', 'true');
  url.searchParams.set('connector_names', connectorName);
  url.searchParams.set('environment', targetEnvironment);

  const response = await fetch(url.toString(), {
    headers: {
      'Accept': 'application/json',
      'X_REPLIT_TOKEN': xReplitToken
    }
  });

  const data = await response.json();
  const connectionSettings = data.items?.[0];

  if (!connectionSettings?.settings?.secret) {
    throw new Error(`Stripe ${targetEnvironment} connection not found`);
  }

  return new Stripe(connectionSettings.settings.secret, {
    apiVersion: '2025-11-17.clover'
  });
}

async function main() {
  console.log('MELORI Stripe Products Setup');
  console.log('============================\n');

  // Connect to database
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    const stripe = await getStripeClient();
    console.log('Connected to Stripe');

    // Define products
    const products = [
      {
        planName: 'pro',
        name: 'MELORI Pro Plan',
        description: 'For serious artists ready to grow. 5% commission, unlimited uploads, weekly payouts.',
        monthlyPrice: 999, // $9.99 in cents
        yearlyPrice: 9900, // $99 in cents (17% savings)
        metadata: {
          plan: 'pro',
          commission_rate: '0.05'
        }
      },
      {
        planName: 'label',
        name: 'MELORI Label Plan',
        description: 'For labels managing multiple artists. 3% commission, 5 storefronts, team access.',
        monthlyPrice: 2999,
        yearlyPrice: 29999,
        metadata: {
          plan: 'label',
          commission_rate: '0.03'
        }
      }
    ];

    for (const productConfig of products) {
      console.log(`\nCreating ${productConfig.name}...`);

      // Check if product already exists
      const existingProducts = await stripe.products.search({
        query: `metadata['plan']:'${productConfig.planName}'`
      });

      let product;
      if (existingProducts.data.length > 0) {
        product = existingProducts.data[0];
        console.log(`  Found existing product: ${product.id}`);
      } else {
        product = await stripe.products.create({
          name: productConfig.name,
          description: productConfig.description,
          metadata: productConfig.metadata
        });
        console.log(`  Created product: ${product.id}`);
      }

      // Check for existing prices
      const existingPrices = await stripe.prices.list({
        product: product.id,
        active: true
      });

      let monthlyPriceId = null;
      let yearlyPriceId = null;

      for (const price of existingPrices.data) {
        if (price.recurring?.interval === 'month' && price.unit_amount === productConfig.monthlyPrice) {
          monthlyPriceId = price.id;
        }
        if (price.recurring?.interval === 'year' && price.unit_amount === productConfig.yearlyPrice) {
          yearlyPriceId = price.id;
        }
      }

      // Create monthly price if not exists
      if (!monthlyPriceId) {
        const monthlyPrice = await stripe.prices.create({
          product: product.id,
          unit_amount: productConfig.monthlyPrice,
          currency: 'usd',
          recurring: {
            interval: 'month'
          },
          metadata: {
            plan: productConfig.planName,
            billing: 'monthly'
          }
        });
        monthlyPriceId = monthlyPrice.id;
        console.log(`  Created monthly price: ${monthlyPriceId}`);
      } else {
        console.log(`  Found existing monthly price: ${monthlyPriceId}`);
      }

      // Create yearly price if not exists
      if (!yearlyPriceId) {
        const yearlyPrice = await stripe.prices.create({
          product: product.id,
          unit_amount: productConfig.yearlyPrice,
          currency: 'usd',
          recurring: {
            interval: 'year'
          },
          metadata: {
            plan: productConfig.planName,
            billing: 'yearly'
          }
        });
        yearlyPriceId = yearlyPrice.id;
        console.log(`  Created yearly price: ${yearlyPriceId}`);
      } else {
        console.log(`  Found existing yearly price: ${yearlyPriceId}`);
      }

      // Update database with price IDs
      const updateResult = await pool.query(`
        UPDATE plans SET 
          stripe_price_id_monthly = $1,
          stripe_price_id_yearly = $2
        WHERE name = $3
        RETURNING id, name, stripe_price_id_monthly, stripe_price_id_yearly
      `, [monthlyPriceId, yearlyPriceId, productConfig.planName]);
      
      if (updateResult.rowCount === 0) {
        console.warn(`  WARNING: No plan found with name '${productConfig.planName}' - database not updated!`);
        console.log(`  Attempting to insert or update plan...`);
        
        // Try upsert in case the plan doesn't exist
        const upsertResult = await pool.query(`
          INSERT INTO plans (name, stripe_price_id_monthly, stripe_price_id_yearly, commission_rate, max_storefronts)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (name) DO UPDATE SET
            stripe_price_id_monthly = EXCLUDED.stripe_price_id_monthly,
            stripe_price_id_yearly = EXCLUDED.stripe_price_id_yearly
          RETURNING id, name, stripe_price_id_monthly, stripe_price_id_yearly
        `, [
          productConfig.planName, 
          monthlyPriceId, 
          yearlyPriceId, 
          parseFloat(productConfig.metadata.commission_rate),
          productConfig.planName === 'label' ? 5 : 1
        ]);
        
        if (upsertResult.rowCount > 0) {
          console.log(`  Successfully upserted plan: ${productConfig.planName}`);
          console.log(`    - Monthly Price ID: ${upsertResult.rows[0].stripe_price_id_monthly}`);
          console.log(`    - Yearly Price ID: ${upsertResult.rows[0].stripe_price_id_yearly}`);
        } else {
          console.error(`  FAILED: Could not update or insert plan '${productConfig.planName}'`);
        }
      } else {
        console.log(`  Updated database for ${productConfig.planName} plan`);
        console.log(`    - Monthly Price ID: ${updateResult.rows[0].stripe_price_id_monthly}`);
        console.log(`    - Yearly Price ID: ${updateResult.rows[0].stripe_price_id_yearly}`);
      }
    }

    // Verify database updates
    console.log('\nVerifying database...');
    const result = await pool.query('SELECT name, stripe_price_id_monthly, stripe_price_id_yearly FROM plans');
    console.log('\nPlan Price IDs:');
    console.table(result.rows);

    console.log('\nSetup complete!');

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
