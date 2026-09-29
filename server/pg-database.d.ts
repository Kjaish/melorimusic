export class PgDatabase {
  pool: any;
  query(text: string, params?: any[]): Promise<any>;
  initialize(): Promise<void>;
  runMigrations(): Promise<void>;
  seedPlans(): Promise<void>;
  createDefaultAdmin(): Promise<void>;

  // User methods
  createUser(userData: any): Promise<string | number>;
  getUserByUsername(username: string): Promise<any>;
  getUserByEmail(email: string): Promise<any>;
  getUserById(id: string | number): Promise<any>;
  updateUserAvatar(userId: any, avatarUrl: string): Promise<any>;
  updateUser(id: any, data: any): Promise<any>;
  verifyUserPassword(userId: any, password: string): Promise<boolean>;
  updateUserCredentials(userId: any, username: string, newPassword: string): Promise<any>;
  updateUserPassword(userId: any, password: string): Promise<any>;
  getUserWithPlan(userId: any): Promise<any>;
  getUserByStripeCustomerId(customerId: string): Promise<any>;
  updateUserStripeCustomerId(id: any, customerId: string): Promise<any>;
  updateUserStripeConnectId(userId: any, stripeConnectAccountId: string): Promise<any>;

  // Address methods
  createAddress(addressData: any): Promise<string | number>;
  getAddressesByUserId(userId: any, type?: string): Promise<any[]>;
  deleteAddress(id: any, userId: any): Promise<boolean>;

  // Plan methods
  getAllPlans(): Promise<any[]>;
  getPlanById(id: number): Promise<any>;
  getPlanByName(name: string): Promise<any>;

  // Storefront methods
  createStorefront(data: any): Promise<any>;
  getStorefrontById(id: any): Promise<any>;
  getStorefrontBySlug(slug: string): Promise<any>;
  getStorefrontsByUserId(userId: any): Promise<any[]>;
  updateStorefront(id: any, data: any): Promise<any>;
  deleteStorefront(id: any): Promise<boolean>;
  softDeleteStorefront(id: any): Promise<boolean>;
  checkSlugExists(slug: string, excludeId?: any): Promise<boolean>;
  getStorefrontAlbumsAndSingles(storefrontId: any): Promise<any>;
  getStorefrontWithOwner(slug: string): Promise<any>;
  getStorefrontStats(storefrontId: any): Promise<any>;

  // Storefront Member methods
  addStorefrontMember(storefrontId: any, userId: any, role: string): Promise<any>;
  acceptStorefrontInvite(storefrontId: any, userId: any): Promise<boolean>;
  removeStorefrontMember(storefrontId: any, userId: any): Promise<boolean>;
  getStorefrontMembers(storefrontId: any): Promise<any[]>;

  // Album methods (MT)
  createAlbum(albumData: any): Promise<any>;
  getAlbumById(id: any): Promise<any>;
  getAlbumsByStorefrontId(storefrontId: any): Promise<any[]>;
  updateAlbum(id: any, data: any): Promise<any>;
  deleteAlbum(id: any): Promise<boolean>;

  // Song methods (MT)
  createSong(songData: any): Promise<any>;
  getSongById(id: any): Promise<any>;
  getSingleById(id: any): Promise<any>; // Added
  getSongsByAlbumId(albumId: any): Promise<any[]>;
  getSongsByStorefrontId(storefrontId: any): Promise<any[]>;
  deleteSong(id: any): Promise<boolean>;

  // Sales methods (MT)
  createSale(saleData: any): Promise<any>;
  getSalesByStorefrontId(storefrontId: any, limit?: number): Promise<any[]>;
  getSaleById(id: any): Promise<any>;

  // Transaction methods
  createTransaction(transactionData: any): Promise<any>;
  getTransactionsByStorefrontId(storefrontId: any, status?: string): Promise<any[]>;
  updateTransactionPayout(id: any, stripeTransferId: string, payoutDate: Date): Promise<any>;
  getPendingPayouts(storefrontId: any): Promise<any>;
  getTransactionsByUser(userId: any): Promise<any[]>;
  getPendingPayoutsByUser(userId: any): Promise<any>;
  getEarningsSummary(userId: any): Promise<any>;
  getRecentTransactions(userId: any, limit?: number): Promise<any[]>;

  // Helper methods for relationships
  getAlbumWithStorefront(albumId: any): Promise<any>;
  getSongWithStorefront(songId: any): Promise<any>;
  getStorefrontOwnerPlan(storefrontId: any): Promise<any>;

  // Missing methods identified from logs
  updateUserPlan(id: any, planId: any): Promise<any>;
  canUserUpload(userId: any): Promise<any>;
  canUserCreateStorefront(userId: any): Promise<any>;
  getRecentSales(userId: any): Promise<any[]>;

  // Feedback
  getAllFeedback(): Promise<any[]>;
  getFeedbackStats(): Promise<any>;
  updateFeedbackStatus(id: any, status: string): Promise<any>;
  deleteFeedback(id: any): Promise<boolean>;
  createFeedback(data: any): Promise<any>;

  // Public Comments
  createPublicComment(name: string, message: string): Promise<any>;
  getPublicComments(limit?: number): Promise<any[]>;
  deletePublicComment(id: any): Promise<boolean>;

  // Analytics
  logAnalyticsEvent(data: any): Promise<void>;
  getAnalyticsSummary(days?: number): Promise<any>;
  getTopPagesByViews(days?: number, limit?: number): Promise<any[]>;
  getUserEngagement(days?: number, limit?: number): Promise<any>;
  getRecentAnalyticsEvents(limit?: number): Promise<any[]>;

  // Promo
  validatePromoCode(keyword: string, code: string): Promise<any>; // Corrected
  isDisposableEmail(email: string): boolean; // Corrected: synchronous
  checkRateLimit(email: string, maxAttempts?: number): Promise<any>;
  redeemPromoCode(keyword: string, code: string, email: string, userId?: any, ipAddress?: string): Promise<any>; // Corrected
  logRedemptionAttempt(email: string, ip: string, keyword: string, code: string, success: boolean): Promise<any>; // Corrected
  getPromoCampaigns(userId: any): Promise<any[]>;
  getPromoCampaignById(id: any): Promise<any>;
  getActivePromoCodeCount(userId: any): Promise<number>;
  createPromoCampaign(data: any): Promise<any>;
  generatePromoCodes(campaignId: any, count: number): Promise<any>;
  getPromoCodesByCampaign(campaignId: any, status?: string | null, limit?: number): Promise<any[]>; // Corrected
  deactivatePromoCampaign(id: any): Promise<any>;
  deletePromoCampaign(id: any): Promise<any>;
  getPromoRedemptions(campaignId?: any, limit?: number): Promise<any[]>;
  getPromoStats(campaignId?: any): Promise<any>;
  getPromoRedemptionById(id: any): Promise<any>;
  getAllPromoCodes(userId: any): Promise<any[]>;

  // Token
  // Corrected createPasswordResetToken signature
  createPasswordResetToken(userId: any, token: string, expiresAt: Date): Promise<any>;
  getValidPasswordResetToken(token: string): Promise<any>;
  markPasswordResetTokenUsed(token: string): Promise<any>;
  // Corrected getOrCreateSession signature
  getOrCreateSession(sessionData: any): Promise<any>;
  // Corrected updateSessionActivity signature
  updateSessionActivity(sessionId: string, durationMs?: number): Promise<any>;
}

declare const pgDatabase: PgDatabase;
export default pgDatabase;
