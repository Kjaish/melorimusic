export interface Database {
  db: any;
  initialize(): Promise<void>;

  // User methods
  createUser(userData: any): Promise<number>;
  getUserByUsername(username: string): Promise<any>;
  getUserById(id: string | number): Promise<any>;
  updateUserBankInfo(userId: any, bankInfo: any): Promise<number>;
  updateUserCredentials(userId: any, username: string, newPass: string): Promise<number>;
  verifyUserPassword(userId: any, password: string): Promise<boolean>;

  // Album methods
  getAlbumCount(): Promise<number>;
  createAlbum(albumData: any): Promise<number>;
  getAlbumById(id: string | number): Promise<any>;
  getAllAlbums(): Promise<any[]>;
  updateAlbumOrder(albumOrders: { id: number, order: number }[]): Promise<boolean>;
  updateAlbum(id: any, albumData: any): Promise<number>;
  deleteAlbum(id: any): Promise<number>;
  getAllActiveAlbums(): Promise<any[]>;

  // Song methods
  createSong(songData: any): Promise<number>;
  getSongById(id: string | number): Promise<any>;
  getSongsByAlbumId(albumId: string | number): Promise<any[]>;
  getSongsByStorefrontId(storefrontId: string | number): Promise<any[]>;
  deleteSong(id: any): Promise<number>;
  getAllSongs(): Promise<any[]>;

  // Single methods
  createSingle(songData: any): Promise<number>;
  getAllSingles(): Promise<any[]>;
  updateSingleOrder(singleOrders: { id: number, order: number }[]): Promise<boolean>;
  updateSong(id: any, songData: any): Promise<number>;
  updateSingle(id: any, songData: any): Promise<number>;
  deleteSingle(id: any): Promise<number>;

  // Sale methods
  createSale(saleData: any): Promise<number>;
  getSaleById(id: string | number): Promise<any>;
  getRecentSales(limit?: number): Promise<any[]>;
  getUserPurchaseCount(email: string): Promise<number>;

  // Analytics methods
  getDashboardStats(): Promise<any>;
  getTrafficStats(days?: number): Promise<any[]>;
  logSearch(query: string, resultCount: number): Promise<number>;
  getRecentSearches(limit?: number): Promise<any[]>;
  getTopSearches(limit?: number): Promise<any[]>;
  logTraffic(pagePath: string, ip: string, userAgent: string): Promise<number>;
}

declare const database: Database;
export default database;
