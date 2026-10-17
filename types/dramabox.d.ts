declare module '@zhadev/dramabox' {
  export const config: Record<string, unknown>;
  export default class DramaboxClient {
    constructor(options: { language: string; timeout: number; maxRetries: number; cacheTTL: number; requestDelay: number });
    getDramaList(page: number, size: number): Promise<unknown>;
    getLatest(page: number): Promise<unknown>;
    getRecommendedBooks(): Promise<unknown>;
    getTrending(): Promise<unknown>;
    getCategories(page: number, size: number): Promise<unknown>;
    getBooksByCategory(id: string, page: number, size: number): Promise<unknown>;
    searchDrama(q: string, page: number, size: number): Promise<unknown>;
    getDramaDetail(id: string): Promise<unknown>;
    getChapters(id: string): Promise<unknown>;
    getEpisodeDetails(id: string, index: number): Promise<unknown>;
    getStreamUrl(id: string, index: number): Promise<unknown>;
    getCached: (...args: unknown[]) => unknown;
    setCached: (...args: unknown[]) => unknown;
    cache: { close(): void };
  }
}
