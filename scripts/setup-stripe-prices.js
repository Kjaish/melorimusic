/**
 * Setup Stripe Products and Prices for MELORI MUSIC subscription plans
 * Run this script once to create products/prices in Stripe and update the database
 * 
 * Usage: node scripts/setup-stripe-prices.js
 */

import Stripe from 'stripe';
import { config } from 'dotenv';
import pg from 'pg';

config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function getStripeCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? 'depl ' + process.env.WEB_REPL_RENEWAL
      : null;

  if (!xReplitToken) {
    throw new Error('Replit identity token not found. Run this script in the Replit environment.');
  }

  const connectorName = 'stripe';
  const targetEnvironment = process.env.REPLIT_DEPLOYMENT === '1' ? 'production' : 'development';

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

  if (!connectionSettings || !connectionSettings.settings?.secret) {
    throw new Error(`Stripe ${targetEnvironment} connection not found. Please set up Stripe integration first.`);
  }

  return connectionSettings.settings.secret;
}

async function setupStripePrices() {
  console.log('Setting up Stripe products and prices for MELORI MUSIC...\n');

  try {
    const secretKey = await getStripeCredentials();
    const stripe = new Stripe(secretKey);
    
    console.log('Connected to Stripe successfully!\n');

    const plans = [
      {
        name: 'pro',
        displayName: 'Pro',
        description: 'For serious artists ready to grow - 5% commission, weekly payouts',
        monthlyPrice: 999,
        yearlyPrice: 9900,
      },
      {
        name: 'label',
        displayName: 'Label',
        description: 'For labels managing multiple artists - 3% commission, priority payouts',
        monthlyPrice: 2999,
        yearlyPrice: 29999,
      }
    ];

    for (const plan of plans) {
      console.log(`Processing ${plan.displayName} plan...`);

      const existingProducts = await stripe.products.search({
        query: `metadata['plan_name']:'${plan.name}'`
      });

      let product;
      if (existingProducts.data.length > 0) {
        product = existingProducts.data[0];
        console.log(`  Found existing product: ${product.id}`);
      } else {
        product = await stripe.products.create({
          name: `MELORI ${plan.displayName} Plan`,
          description: plan.description,
          metadata: {
            plan_name: plan.name
          }
        });
        console.log(`  Created product: ${product.id}`);
      }

      const existingPrices = await stripe.prices.list({
        product: product.id,
        active: true
      });

      let monthlyPriceId = null;
      let yearlyPriceId = null;

      for (const price of existingPrices.data) {
        if (price.recurring?.interval === 'month' && price.unit_amount === plan.monthlyPrice) {
          monthlyPriceId = price.id;
          console.log(`  Found existing monthly price: ${monthlyPriceId}`);
        }
        if (price.recurring?.interval === 'year' && price.unit_amount === plan.yearlyPrice) {
          yearlyPriceId = price.id;
          console.log(`  Found existing yearly price: ${yearlyPriceId}`);
        }
      }

      if (!monthlyPriceId) {
        const monthlyPrice = await stripe.prices.create({
          product: product.id,
          unit_amount: plan.monthlyPrice,
          currency: 'usd',
          recurring: {
            interval: 'month'
          },
          metadata: {
            plan_name: plan.name,
            billing_period: 'monthly'
          }
        });
        monthlyPriceId = monthlyPrice.id;
        console.log(`  Created monthly price: ${monthlyPriceId}`);
      }

      if (!yearlyPriceId) {
        const yearlyPrice = await stripe.prices.create({
          product: product.id,
          unit_amount: plan.yearlyPrice,
          currency: 'usd',
          recurring: {
            interval: 'year'
          },
          metadata: {
            plan_name: plan.name,
            billing_period: 'yearly'
          }
        });
        yearlyPriceId = yearlyPrice.id;
        console.log(`  Created yearly price: ${yearlyPriceId}`);
      }

      await pool.query(
        `UPDATE plans 
         SET stripe_price_id_monthly = $1, stripe_price_id_yearly = $2 
         WHERE name = $3`,
        [monthlyPriceId, yearlyPriceId, plan.name]
      );
      console.log(`  Updated database with price IDs\n`);
    }

    console.log('Stripe setup complete!');
    console.log('\nVerifying database updates...');

    const result = await pool.query(
      'SELECT name, price_monthly, stripe_price_id_monthly, stripe_price_id_yearly FROM plans ORDER BY price_monthly ASC NULLS FIRST'
    );

    console.log('\nPlans in database:');
    for (const row of result.rows) {
      console.log(`  ${row.name}:`);
      console.log(`    Monthly: $${row.price_monthly || 'Free'} → ${row.stripe_price_id_monthly || 'N/A'}`);
      console.log(`    Yearly: ${row.stripe_price_id_yearly || 'N/A'}`);
    }

  } catch (error) {
    console.error('Error setting up Stripe prices:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

setupStripePrices();
