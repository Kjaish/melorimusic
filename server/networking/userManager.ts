interface NetworkingUser {
  id: number;
  username: string;
  avatar?: string;
  isOnline: boolean;
  currentPanelId?: string;
  contacts: number[];
  lastSeen: Date;
}

class UserManager {
  private users: Map<number, NetworkingUser> = new Map();
  private onlineUsers: Set<number> = new Set();

  registerUser(userId: number, username: string, avatar?: string): NetworkingUser {
    const user: NetworkingUser = {
      id: userId,
      username,
      avatar,
      isOnline: true,
      contacts: [],
      lastSeen: new Date()
    };
    
    this.users.set(userId, user);
    this.onlineUsers.add(userId);
    return user;
  }

  getUser(userId: number): NetworkingUser | undefined {
    return this.users.get(userId);
  }

  setUserOnline(userId: number): void {
    const user = this.users.get(userId);
    if (user) {
      user.isOnline = true;
      user.lastSeen = new Date();
      this.onlineUsers.add(userId);
    }
  }

  setUserOffline(userId: number): void {
    const user = this.users.get(userId);
    if (user) {
      user.isOnline = false;
      user.lastSeen = new Date();
      user.currentPanelId = undefined;
      this.onlineUsers.delete(userId);
    }
  }

  getOnlineCount(): number {
    return this.onlineUsers.size;
  }

  getOnlineUsers(): NetworkingUser[] {
    return Array.from(this.onlineUsers).map(id => this.users.get(id)!).filter(Boolean);
  }

  setUserPanel(userId: number, panelId: string | undefined): void {
    const user = this.users.get(userId);
    if (user) {
      user.currentPanelId = panelId;
    }
  }

  addContact(userId: number, contactId: number): boolean {
    const user = this.users.get(userId);
    if (!user) return false;
    
    if (!user.contacts.includes(contactId)) {
      user.contacts.push(contactId);
    }
    return true;
  }

  removeContact(userId: number, contactId: number): boolean {
    const user = this.users.get(userId);
    if (!user) return false;
    
    const index = user.contacts.indexOf(contactId);
    if (index > -1) {
      user.contacts.splice(index, 1);
      return true;
    }
    return false;
  }

  getContacts(userId: number): NetworkingUser[] {
    const user = this.users.get(userId);
    if (!user) return [];
    
    return user.contacts
      .map(id => this.users.get(id))
      .filter((u): u is NetworkingUser => u !== undefined);
  }

  getUserProfile(userId: number): object | null {
    const user = this.users.get(userId);
    if (!user) return null;

    return {
      id: user.id,
      username: user.username,
      avatar: user.avatar,
      isOnline: user.isOnline,
      contactCount: user.contacts.length
    };
  }
}

export const userManager = new UserManager();
export default userManager;
