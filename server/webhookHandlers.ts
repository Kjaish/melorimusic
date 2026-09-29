import { getStripeSync, getUncachableStripeClient } from './stripeClient';
import { getAuthProvider } from './dbProvider';
import { sendPurchaseConfirmationEmail } from './email-client';
import { randomBytes } from 'crypto';

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'This usually means express.json() parsed the body before reaching this handler. ' +
        'FIX: Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    // Use stripe-replit-sync for standard processing
    const sync = await getStripeSync();
    try {
      await sync.processWebhook(payload, signature);
    } catch (error: any) {
      // If sync fails (likely due to signature mismatch in local dev with CLI),
      // try to verify manually with the local env var secret.
      if (process.env.STRIPE_WEBHOOK_SECRET) {
        try {
          const stripe = await getUncachableStripeClient();
          const event = stripe.webhooks.constructEvent(payload, signature, process.env.STRIPE_WEBHOOK_SECRET);

          console.log('Signature verified using local STRIPE_WEBHOOK_SECRET. Skipping sync.processWebhook.');

          // Manually trigger our handlers since sync didn't reach them
          await WebhookHandlers.handleSubscriptionEvent(event);
          return;
        } catch (manualError: any) {
          console.error('Local signature verification also failed:', manualError.message);
        }
      }

      console.error('Stripe Sync Webhook Error:', error.message);
      // Don't rethrow if we handled it manually effectively, but here we failed both.
      // However, if sync failed but manual didn't run (no secret), we should probably throw.
      if (!process.env.STRIPE_WEBHOOK_SECRET) throw error;
      // If we tried manual and it failed, we throw the original or manual error.
      throw error;
    }

    // Also handle subscription-specific events (if sync passed)
    try {
      const stripe = await getUncachableStripeClient();
      const webhookSecret = await WebhookHandlers.getWebhookSecret();

      if (webhookSecret) {
        const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
        await WebhookHandlers.handleSubscriptionEvent(event);
      }
    } catch (err: any) {
      console.error('Custom webhook handler error:', err.message);
    }
  }

  private static async getWebhookSecret(): Promise<string | null> {
    try {
      const sync = await getStripeSync();
      const webhook = await sync.findOrCreateManagedWebhook(
        `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}/api/stripe/webhook`
      );
      return webhook?.webhook?.secret || null;
    } catch {
      return null;
    }
  }

  static async handleSubscriptionEvent(event: any): Promise<void> {
    const eventObject = event.data?.object;

    switch (event.type) {
      case 'customer.subscription.created':
        await WebhookHandlers.handleSubscriptionCreated(eventObject);
        break;

      case 'customer.subscription.updated':
        await WebhookHandlers.handleSubscriptionUpdated(eventObject);
        break;

      case 'customer.subscription.deleted':
        await WebhookHandlers.handleSubscriptionDeleted(eventObject);
        break;

      case 'checkout.session.completed':
        await WebhookHandlers.handleCheckoutCompleted(eventObject);
        break;

      default:
        break;
    }
  }

  static getCommissionRate(planName: string | null): number {
    if (!planName) return 0.12;
    const lowerPlanName = planName.toLowerCase();
    if (lowerPlanName === 'label') return 0.03;
    if (lowerPlanName === 'pro') return 0.05;
    return 0.12;
  }

  private static async handleCheckoutCompleted(session: any): Promise<void> {
    try {
      const metadata = session.metadata || {};
      const { type, album_id, song_id, customer_name, discount_percent, user_id, item_id } = metadata;

      if (!type) return;

      // If payment is for a donation, we might just track it and return
      if (type === 'donation') {
        console.log(`Donation received from ${session.customer_email}`);
        return;
      }

      if (type !== 'album' && type !== 'song') return;

      const grossAmount = (session.amount_total || 0) / 100;

      let storefrontId: number | null = null;
      let itemTitle = 'Unknown';
      const db: any = getAuthProvider();

      if (type === 'album' && album_id) {
        const album = await db.getAlbumWithStorefront(parseInt(album_id));
        if (album) {
          storefrontId = album.storefront_id;
          itemTitle = album.title;
        }
      } else if (type === 'song' && song_id) {
        const song = await db.getSongWithStorefront(parseInt(song_id));
        if (song) {
          storefrontId = song.effective_storefront_id;
          itemTitle = song.title;
        }
      }

      if (!storefrontId) {
        console.log(`Checkout completed but no storefront found for ${type} ${album_id || song_id}`);
        return;
      }

      const ownerPlan = await db.getStorefrontOwnerPlan(storefrontId);
      const planName = ownerPlan?.name || 'creator';
      const commissionRate = WebhookHandlers.getCommissionRate(planName);

      const commissionAmount = parseFloat((grossAmount * commissionRate).toFixed(2));
      const netAmount = parseFloat((grossAmount - commissionAmount).toFixed(2));

      // 1. Unified Order Tracking (New System)
      // Update the status of the order created in /api/checkout/session
      await db.updateOrderStatus(session.id, 'paid', session.payment_intent);

      // 2. Legacy Marketplace Logic (Postgres Only)
      let saleId: number | null = null;
      if (db.query) {
        // Try to find existing sale by payment intent
        let saleResult = await db.query(
          `SELECT id FROM sales_mt WHERE stripe_payment_intent_id = $1 LIMIT 1`,
          [session.payment_intent]
        );

        saleId = saleResult.rows.length > 0 ? saleResult.rows[0].id : null;

        if (!saleId) {
          // If no sale found, try to find by other match criteria
          saleResult = await db.query(
            `SELECT id FROM sales_mt WHERE 
              storefront_id = $1 AND 
              (album_id = $2 OR song_id = $3) AND 
              amount = $4 AND
              created_at > NOW() - INTERVAL '1 hour'
            LIMIT 1`,
            [storefrontId, album_id ? parseInt(album_id) : null, song_id ? parseInt(song_id) : null, grossAmount]
          );
          saleId = saleResult.rows.length > 0 ? saleResult.rows[0].id : null;
        }

        if (!saleId) {
          console.log(`No existing sale found for ${itemTitle}, creating sale record...`);
          const newSaleResult = await db.query(
            `INSERT INTO sales_mt (
              storefront_id, album_id, song_id, customer_email, customer_name, 
              amount, type, discount, stripe_payment_intent_id, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'completed')
            RETURNING id`,
            [
              storefrontId,
              album_id ? parseInt(album_id) : null,
              song_id ? parseInt(song_id) : null,
              session.customer_email || '',
              customer_name || '',
              grossAmount,
              type,
              parseFloat(discount_percent || '0'),
              session.payment_intent
            ]
          );
          saleId = newSaleResult.rows[0]?.id;
        }

        // Create Transaction
        if (saleId) {
          const existingTx = await db.query(
            `SELECT id FROM transactions WHERE 
                  (sale_id = $1 AND sale_id IS NOT NULL) OR 
                  (storefront_id = $2 AND gross_amount = $3 AND created_at > NOW() - INTERVAL '5 minutes')
                LIMIT 1`,
            [saleId, storefrontId, grossAmount]
          );

          if (existingTx.rows.length === 0) {
            await db.createTransaction({
              sale_id: saleId,
              storefront_id: storefrontId,
              gross_amount: grossAmount,
              commission_amount: commissionAmount,
              net_amount: netAmount,
              commission_rate: commissionRate
            });
            console.log(`Transaction created: ${itemTitle} - Gross: $${grossAmount}, Net: $${netAmount}`);
          }
        }
      } else {
        console.log('Skipping sales_mt logic (SQLite)');
      }

      // 3. Entitlement & Download Token (Fulfillment)
      if (user_id) {
        await db.createEntitlement({
          id: `ent_${Date.now()}_${randomBytes(4).toString('hex')}`,
          userId: user_id,
          entitlementType: type,
          itemId: String(type === 'album' ? album_id : song_id),
          orderId: session.id // Use session ID as order ref
        });

        const token = randomBytes(32).toString('hex');
        await db.createDownloadToken({
          id: `dt_${Date.now()}_${randomBytes(4).toString('hex')}`,
          token: token,
          userId: user_id,
          entitlementType: type,
          itemId: String(type === 'album' ? album_id : song_id),
          orderId: session.id,
          expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000) // 7 days
        });

        // Send Email
        // Access public base URL from env if possible, else default
        const baseUrl = process.env.PUBLIC_BASE_URL || `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;
        const downloadLink = `${baseUrl}/download?token=${token}`;

        await sendPurchaseConfirmationEmail({
          customerEmail: session.customer_email,
          itemTitle: itemTitle,
          itemType: type as 'album' | 'song',
          downloadUrl: downloadLink
        });
        console.log(`Fulfillment complete for ${user_id}`);
      }

    } catch (error) {
      console.error('Error handling checkout.session.completed:', error);
    }
  }

  private static async handleSubscriptionCreated(subscription: any): Promise<void> {
    console.log(`Subscription created: ${subscription.id}`);

    const customerId = subscription.customer;
    const planName = subscription.metadata?.plan_name;

    if (!customerId || !planName) return;

    try {
      const db: any = getAuthProvider();
      const user = await db.getUserByStripeCustomerId(customerId);
      if (!user) {
        console.log(`No user found for Stripe customer: ${customerId}`);
        return;
      }

      const plan = await db.getPlanByName(planName);
      if (plan) {
        await db.updateUserPlan(user.id, plan.id);
        console.log(`User ${user.id} plan updated to ${planName} via webhook`);
      }
    } catch (error) {
      console.error('Error handling subscription.created:', error);
    }
  }

  private static async handleSubscriptionUpdated(subscription: any): Promise<void> {
    console.log(`Subscription updated: ${subscription.id}`);

    const customerId = subscription.customer;

    if (!customerId) return;

    try {
      const db: any = getAuthProvider();
      const user = await db.getUserByStripeCustomerId(customerId);
      if (!user) return;

      // Check if subscription is being cancelled
      if (subscription.cancel_at_period_end) {
        console.log(`Subscription ${subscription.id} set to cancel at period end`);
        return;
      }

      // Check if plan changed (from price metadata)
      const priceId = subscription.items?.data?.[0]?.price?.id;
      if (priceId) {
        const plans = await db.getAllPlans();
        for (const plan of plans) {
          if (plan.stripe_price_id_monthly === priceId || plan.stripe_price_id_yearly === priceId) {
            if (user.plan_id !== plan.id) {
              await db.updateUserPlan(user.id, plan.id);
              console.log(`User ${user.id} plan changed to ${plan.name} via webhook`);
            }
            break;
          }
        }
      }
    } catch (error) {
      console.error('Error handling subscription.updated:', error);
    }
  }

  private static async handleSubscriptionDeleted(subscription: any): Promise<void> {
    console.log(`Subscription deleted: ${subscription.id}`);

    const customerId = subscription.customer;

    if (!customerId) return;

    try {
      const db: any = getAuthProvider();
      const user = await db.getUserByStripeCustomerId(customerId);
      if (!user) return;

      // Downgrade to Creator (free) plan
      const creatorPlan = await db.getPlanByName('creator');
      if (creatorPlan) {
        await db.updateUserPlan(user.id, creatorPlan.id);
        console.log(`User ${user.id} downgraded to creator plan due to subscription cancellation`);
      }
    } catch (error) {
      console.error('Error handling subscription.deleted:', error);
    }
  }
}
