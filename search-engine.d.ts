export interface SearchEngine {
  tokenizer: any;
  stemmer: any;
  useAI: boolean;
  cache: Map<string, any>;
  initialize(): Promise<void>;
  search(query: string, options?: any): Promise<any[]>;
  aiSearch(query: string): Promise<any[]>;
  keywordSearch(query: string): Promise<any[]>;
  getSuggestions(query: string, limit?: number): Promise<any[]>;
  indexAlbum(albumId: any): Promise<void>;
  clearCache(): void;
}

declare const searchEngine: SearchEngine;
export default searchEngine;
