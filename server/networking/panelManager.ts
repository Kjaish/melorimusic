import { Server as SocketIOServer } from 'socket.io';

interface Participant {
  id: number;
  username: string;
  isSpeaker: boolean;
  isHost: boolean;
  isMuted: boolean;
  handRaised: boolean;
}

interface Panel {
  id: string;
  hostId: number;
  topic: string;
  isPrivate: boolean;
  maxParticipants: number;
  participants: Map<number, Participant>;
  createdAt: Date;
  expiresAt: Date;
  socketMap: Map<number, string>;
}

class PanelManager {
  private panels: Map<string, Panel> = new Map();
  private userSocketMap: Map<number, string> = new Map();
  private usernameMap: Map<number, string> = new Map();
  private io: SocketIOServer | null = null;

  setIO(io: SocketIOServer) {
    this.io = io;
  }

  setUsername(userId: number, username: string) {
    this.usernameMap.set(userId, username);
  }

  getUsername(userId: number): string {
    return this.usernameMap.get(userId) || 'User';
  }

  createPanel(options: {
    hostId: number;
    hostUsername: string;
    topic: string;
    isPrivate: boolean;
    maxParticipants?: number;
  }): Panel {
    const id = this.generatePanelId();
    const participants = new Map<number, Participant>();
    
    participants.set(options.hostId, {
      id: options.hostId,
      username: options.hostUsername,
      isSpeaker: true,
      isHost: true,
      isMuted: false,
      handRaised: false
    });

    this.usernameMap.set(options.hostId, options.hostUsername);

    const panel: Panel = {
      id,
      hostId: options.hostId,
      topic: options.topic,
      isPrivate: options.isPrivate,
      maxParticipants: options.maxParticipants || 9,
      participants,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      socketMap: new Map()
    };

    this.panels.set(id, panel);
    return panel;
  }

  getPanel(panelId: string): Panel | undefined {
    return this.panels.get(panelId);
  }

  getActivePanels(): object[] {
    const now = new Date();
    const activePanels: object[] = [];
    
    this.panels.forEach((panel) => {
      if (panel.expiresAt > now && !panel.isPrivate) {
        const speakers = Array.from(panel.participants.values())
          .filter(p => p.isSpeaker)
          .map(p => ({ id: p.id, username: p.username }));
        
        activePanels.push({
          id: panel.id,
          topic: panel.topic,
          hostId: panel.hostId,
          hostUsername: this.getUsername(panel.hostId),
          participantCount: panel.participants.size,
          maxParticipants: panel.maxParticipants,
          speakers,
          timeRemaining: Math.max(0, panel.expiresAt.getTime() - Date.now())
        });
      }
    });

    return activePanels;
  }

  joinPanel(panelId: string, userId: number, username: string): boolean {
    const panel = this.panels.get(panelId);
    if (!panel) return false;
    if (panel.participants.size >= panel.maxParticipants) return false;
    if (panel.participants.has(userId)) return true;

    this.usernameMap.set(userId, username);
    
    panel.participants.set(userId, {
      id: userId,
      username,
      isSpeaker: false,
      isHost: false,
      isMuted: true,
      handRaised: false
    });

    return true;
  }

  leavePanel(panelId: string, userId: number): boolean {
    const panel = this.panels.get(panelId);
    if (!panel) return false;

    panel.participants.delete(userId);
    panel.socketMap.delete(userId);

    if (panel.participants.size === 0) {
      this.panels.delete(panelId);
    }

    return true;
  }

  getParticipantsList(panelId: string): Participant[] {
    const panel = this.panels.get(panelId);
    if (!panel) return [];
    return Array.from(panel.participants.values());
  }

  promoteToSpeaker(panelId: string, userId: number): boolean {
    const panel = this.panels.get(panelId);
    if (!panel) return false;
    
    const participant = panel.participants.get(userId);
    if (!participant) return false;
    
    participant.isSpeaker = true;
    participant.handRaised = false;
    return true;
  }

  demoteToListener(panelId: string, userId: number): boolean {
    const panel = this.panels.get(panelId);
    if (!panel) return false;
    
    const participant = panel.participants.get(userId);
    if (!participant || participant.isHost) return false;
    
    participant.isSpeaker = false;
    return true;
  }

  raiseHand(panelId: string, userId: number): boolean {
    const panel = this.panels.get(panelId);
    if (!panel) return false;
    
    const participant = panel.participants.get(userId);
    if (!participant) return false;
    
    participant.handRaised = true;
    return true;
  }

  lowerHand(panelId: string, userId: number): boolean {
    const panel = this.panels.get(panelId);
    if (!panel) return false;
    
    const participant = panel.participants.get(userId);
    if (!participant) return false;
    
    participant.handRaised = false;
    return true;
  }

  extendPanelTime(panelId: string, minutes: number): boolean {
    const panel = this.panels.get(panelId);
    if (!panel) return false;

    panel.expiresAt = new Date(panel.expiresAt.getTime() + minutes * 60 * 1000);
    
    if (this.io) {
      this.io.to(panelId).emit('panel-extended', {
        panelId,
        newExpiresAt: panel.expiresAt,
        addedMinutes: minutes
      });
    }

    return true;
  }

  handleUserJoin(panelId: string, userId: number, socketId: string, username: string): void {
    const panel = this.panels.get(panelId);
    if (!panel) return;

    panel.socketMap.set(userId, socketId);
    this.userSocketMap.set(userId, socketId);

    if (this.io) {
      this.io.to(panelId).emit('user-joined', {
        userId,
        username,
        participantCount: panel.participants.size,
        participants: this.getParticipantsList(panelId)
      });
    }
  }

  handleUserDisconnect(socketId: string): void {
    this.panels.forEach((panel, panelId) => {
      panel.socketMap.forEach((sid, odId) => {
        if (sid === socketId) {
          const wasHost = panel.hostId === odId;
          panel.socketMap.delete(odId);
          panel.participants.delete(odId);
          
          if (panel.participants.size === 0) {
            this.panels.delete(panelId);
            return;
          }

          // Reassign host if the host disconnected
          if (wasHost && panel.participants.size > 0) {
            const newHost = this.reassignHost(panelId);
            if (this.io && newHost) {
              this.io.to(panelId).emit('host-changed', {
                newHostId: newHost.id,
                newHostUsername: newHost.username,
                participants: this.getParticipantsList(panelId)
              });
            }
          }
          
          if (this.io) {
            this.io.to(panelId).emit('user-left', {
              userId: odId,
              participantCount: panel.participants.size,
              participants: this.getParticipantsList(panelId)
            });
          }
        }
      });
    });

    this.userSocketMap.forEach((sid, odId) => {
      if (sid === socketId) {
        this.userSocketMap.delete(odId);
      }
    });
  }

  reassignHost(panelId: string): Participant | null {
    const panel = this.panels.get(panelId);
    if (!panel || panel.participants.size === 0) return null;

    // Find the first speaker to become host, or first participant
    const participants = Array.from(panel.participants.values());
    const newHost = participants.find(p => p.isSpeaker) || participants[0];
    
    if (newHost) {
      newHost.isHost = true;
      newHost.isSpeaker = true;
      panel.hostId = newHost.id;
      return newHost;
    }
    
    return null;
  }

  getUserSocket(userId: number): string | undefined {
    return this.userSocketMap.get(userId);
  }

  getPanelState(panelId: string): object | null {
    const panel = this.panels.get(panelId);
    if (!panel) return null;

    return {
      id: panel.id,
      topic: panel.topic,
      hostId: panel.hostId,
      participantCount: panel.participants.size,
      maxParticipants: panel.maxParticipants,
      expiresAt: panel.expiresAt,
      timeRemaining: Math.max(0, panel.expiresAt.getTime() - Date.now()),
      participants: this.getParticipantsList(panelId)
    };
  }

  private generatePanelId(): string {
    return 'room_' + Math.random().toString(36).substring(2, 15);
  }

  cleanupExpiredPanels(): void {
    const now = new Date();
    this.panels.forEach((panel, panelId) => {
      if (panel.expiresAt <= now) {
        if (this.io) {
          this.io.to(panelId).emit('panel-expired', { panelId });
        }
        this.panels.delete(panelId);
      }
    });
  }
}

export const panelManager = new PanelManager();
export default panelManager;
