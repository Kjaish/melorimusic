import Stripe from 'stripe';

let connectionSettings: any;
let cachedCredentials: { publishableKey: string; secretKey: string } | null = null;

async function getCredentials() {
  // First, try to use manually set environment variables (preferred for control)
  const manualSecretKey = process.env.STRIPE_SECRET_KEY;
  const manualPublishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
  
  // Debug logging - show first 10 chars of key
  const keyPrefix = manualSecretKey ? manualSecretKey.substring(0, 10) : 'NOT_SET';
  console.log(`[Stripe] STRIPE_SECRET_KEY prefix: ${keyPrefix}...`);
  
  if (manualSecretKey && manualPublishableKey) {
    const isLiveMode = manualSecretKey.startsWith('sk_live_');
    console.log(`[Stripe] Using manual env vars - Mode: ${isLiveMode ? 'LIVE' : 'TEST'}, Key starts with: ${manualSecretKey.substring(0, 8)}`);
    cachedCredentials = {
      publishableKey: manualPublishableKey,
      secretKey: manualSecretKey,
    };
    return cachedCredentials;
  }

  // Fallback to Replit connector
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? 'depl ' + process.env.WEB_REPL_RENEWAL
      : null;

  if (!xReplitToken || !hostname) {
    // Final fallback - use just the secret key if available
    if (manualSecretKey) {
      console.log(`[Stripe] Using STRIPE_SECRET_KEY only (no publishable key set)`);
      cachedCredentials = {
        publishableKey: '',
        secretKey: manualSecretKey,
      };
      return cachedCredentials;
    }
    throw new Error('No Stripe credentials available - set STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY');
  }

  const connectorName = 'stripe';
  const isProduction = process.env.REPLIT_DEPLOYMENT === '1';
  const targetEnvironment = isProduction ? 'production' : 'development';

  try {
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
    connectionSettings = data.items?.[0];

    if (connectionSettings?.settings?.publishable && connectionSettings?.settings?.secret) {
      const isLiveMode = connectionSettings.settings.secret.startsWith('sk_live_');
      console.log(`[Stripe] Using Replit connector (${targetEnvironment}) - Mode: ${isLiveMode ? 'LIVE' : 'TEST'}`);
      cachedCredentials = {
        publishableKey: connectionSettings.settings.publishable,
        secretKey: connectionSettings.settings.secret,
      };
      return cachedCredentials;
    }
  } catch (error) {
    console.log(`[Stripe] Connector fetch failed: ${error}`);
  }

  // Last resort - use manual secret key
  if (manualSecretKey) {
    const isLiveMode = manualSecretKey.startsWith('sk_live_');
    console.log(`[Stripe] Connector failed, using STRIPE_SECRET_KEY - Mode: ${isLiveMode ? 'LIVE' : 'TEST'}`);
    cachedCredentials = {
      publishableKey: manualPublishableKey || '',
      secretKey: manualSecretKey,
    };
    return cachedCredentials;
  }

  throw new Error(`Stripe ${targetEnvironment} connection not found and no fallback available`);
}

export async function getUncachableStripeClient() {
  const { secretKey } = await getCredentials();

  return new Stripe(secretKey, {
    apiVersion: '2025-11-17.clover' as any,
  });
}

export async function getStripePublishableKey() {
  const { publishableKey } = await getCredentials();
  return publishableKey;
}

export async function getStripeSecretKey() {
  const { secretKey } = await getCredentials();
  return secretKey;
}

let stripeSync: any = null;

export async function getStripeSync() {
  if (!stripeSync) {
    const { StripeSync } = await import('stripe-replit-sync');
    const secretKey = await getStripeSecretKey();

    stripeSync = new StripeSync({
      poolConfig: {
        connectionString: process.env.DATABASE_URL!,
        max: 2,
      },
      stripeSecretKey: secretKey,
    });
  }
  return stripeSync;
}
