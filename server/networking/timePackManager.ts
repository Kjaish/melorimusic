interface TimePack {
  id: string;
  name: string;
  minutes: number;
  price: number;
}

const TIME_PACKS: TimePack[] = [
  { id: 'basic', name: 'Basic Pack', minutes: 60, price: 4.99 },
  { id: 'pro', name: 'Pro Pack', minutes: 180, price: 12.99 },
  { id: 'premium', name: 'Premium Pack', minutes: 500, price: 29.99 }
];

class TimePackManager {
  private userTimeBalances: Map<number, number> = new Map();

  getAvailablePacks(): TimePack[] {
    return TIME_PACKS;
  }

  getPack(packId: string): TimePack | undefined {
    return TIME_PACKS.find(p => p.id === packId);
  }

  async getUserTime(userId: number): Promise<number> {
    return this.userTimeBalances.get(userId) || 0;
  }

  async addTime(userId: number, minutes: number): Promise<boolean> {
    const currentTime = this.userTimeBalances.get(userId) || 0;
    this.userTimeBalances.set(userId, currentTime + minutes);
    return true;
  }

  async deductTime(userId: number, minutes: number): Promise<boolean> {
    const currentTime = this.userTimeBalances.get(userId) || 0;
    if (currentTime < minutes) return false;
    
    this.userTimeBalances.set(userId, currentTime - minutes);
    return true;
  }

  async checkTime(userId: number, requiredMinutes: number): Promise<boolean> {
    const currentTime = this.userTimeBalances.get(userId) || 0;
    return currentTime >= requiredMinutes;
  }

  async purchasePack(userId: number, packId: string): Promise<{ success: boolean; message: string; newBalance?: number }> {
    const pack = this.getPack(packId);
    if (!pack) {
      return { success: false, message: 'Invalid pack' };
    }

    await this.addTime(userId, pack.minutes);
    const newBalance = await this.getUserTime(userId);

    return {
      success: true,
      message: `Purchased ${pack.minutes} minutes`,
      newBalance
    };
  }
}

export const timePackManager = new TimePackManager();
export default timePackManager;
