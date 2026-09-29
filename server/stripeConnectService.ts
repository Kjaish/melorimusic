import { getUncachableStripeClient } from './stripeClient';
import pgDatabase from './pg-database.js';

export class StripeConnectService {
  
  async createConnectAccount(userId: number, email: string) {
    const stripe = await getUncachableStripeClient();
    
    const account = await stripe.accounts.create({
      type: 'express',
      email: email,
      metadata: {
        userId: userId.toString(),
        platform: 'melori_music'
      },
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true }
      }
    });
    
    await pgDatabase.updateUserStripeConnectId(userId, account.id);
    
    return account;
  }
  
  async createAccountLink(accountId: string, refreshUrl: string, returnUrl: string) {
    const stripe = await getUncachableStripeClient();
    
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: 'account_onboarding'
    });
    
    return accountLink;
  }
  
  async getAccountStatus(accountId: string) {
    const stripe = await getUncachableStripeClient();
    
    const account = await stripe.accounts.retrieve(accountId);
    
    return {
      id: account.id,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
      requirements: account.requirements
    };
  }
  
  async createTransfer(
    amount: number,
    currency: string,
    destinationAccountId: string,
    metadata: Record<string, string>
  ) {
    const stripe = await getUncachableStripeClient();
    
    const transfer = await stripe.transfers.create({
      amount: Math.round(amount * 100),
      currency: currency,
      destination: destinationAccountId,
      metadata: metadata
    });
    
    return transfer;
  }
  
  async processPaymentWithTransfer(
    paymentIntentId: string,
    artistConnectAccountId: string,
    grossAmount: number,
    commissionRate: number,
    saleId: number,
    storefrontId: number
  ) {
    const stripe = await getUncachableStripeClient();
    
    const commissionAmount = grossAmount * commissionRate;
    const netAmount = grossAmount - commissionAmount;
    
    const transfer = await stripe.transfers.create({
      amount: Math.round(netAmount * 100),
      currency: 'usd',
      destination: artistConnectAccountId,
      transfer_group: `sale_${saleId}`,
      metadata: {
        sale_id: saleId.toString(),
        storefront_id: storefrontId.toString(),
        gross_amount: grossAmount.toString(),
        commission_amount: commissionAmount.toString(),
        commission_rate: commissionRate.toString()
      }
    });
    
    await pgDatabase.createTransaction({
      sale_id: saleId,
      storefront_id: storefrontId,
      gross_amount: grossAmount,
      commission_amount: commissionAmount,
      net_amount: netAmount,
      commission_rate: commissionRate,
      stripe_transfer_id: transfer.id,
      payout_status: 'pending'
    });
    
    return {
      transfer,
      grossAmount,
      commissionAmount,
      netAmount
    };
  }
  
  async createLoginLink(accountId: string) {
    const stripe = await getUncachableStripeClient();
    
    const loginLink = await stripe.accounts.createLoginLink(accountId);
    
    return loginLink;
  }
  
  async getAccountBalance(accountId: string) {
    const stripe = await getUncachableStripeClient();
    
    const balance = await stripe.balance.retrieve({
      stripeAccount: accountId
    });
    
    return balance;
  }
}

export const stripeConnectService = new StripeConnectService();
