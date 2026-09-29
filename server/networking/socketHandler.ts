import { Server as SocketIOServer, Socket } from 'socket.io';
import { panelManager } from './panelManager';
import { userManager } from './userManager';

const SPAM_BLACKLIST = [
  'buy my album', 'stream my song', 'purchase track',
  'spotify.com/', 'soundcloud.com/', 'bandcamp.com/',
  'buy now', 'limited offer', 'free download'
];

export function setupNetworkingSocket(io: SocketIOServer) {
  panelManager.setIO(io);

  const networkingNs = io.of('/networking');

  networkingNs.on('connection', (socket: Socket) => {
    console.log('Networking connection:', socket.id);
    let currentUserId: number | null = null;
    let currentUsername: string = 'User';
    let currentPanelId: string | null = null;

    socket.on('register', ({ userId, username, avatar }) => {
      currentUserId = userId;
      currentUsername = username || 'User';
      userManager.registerUser(userId, username, avatar);
      panelManager.setUsername(userId, username);
      socket.emit('registered', { userId, onlineCount: userManager.getOnlineCount() });
      networkingNs.emit('online-count', { count: userManager.getOnlineCount() });
    });

    socket.on('join-panel', ({ panelId, userId }) => {
      currentPanelId = panelId;
      currentUserId = userId;
      
      socket.join(panelId);
      const username = panelManager.getUsername(userId) || currentUsername;
      panelManager.handleUserJoin(panelId, userId, socket.id, username);
      userManager.setUserPanel(userId, panelId);

      const panelState = panelManager.getPanelState(panelId);
      socket.emit('panel-state', panelState);
    });

    socket.on('leave-panel', ({ panelId }) => {
      if (currentUserId && currentPanelId) {
        socket.leave(panelId);
        panelManager.leavePanel(panelId, currentUserId);
        userManager.setUserPanel(currentUserId, undefined);
        
        networkingNs.to(panelId).emit('user-left', {
          userId: currentUserId,
          participants: panelManager.getParticipantsList(panelId)
        });
        
        currentPanelId = null;
      }
    });

    socket.on('panel-message', ({ panelId, userId, message, username }) => {
      const lowerMsg = message.toLowerCase();
      const isSpam = SPAM_BLACKLIST.some(word => lowerMsg.includes(word));

      if (isSpam) {
        socket.emit('warning', {
          type: 'spam',
          message: 'Promotional content is not allowed in networking rooms'
        });
        return;
      }

      if (message.length > 500) {
        socket.emit('warning', {
          type: 'length',
          message: 'Message too long (max 500 characters)'
        });
        return;
      }

      networkingNs.to(panelId).emit('new-message', {
        userId,
        username,
        message,
        timestamp: Date.now()
      });
    });

    socket.on('raise-hand', ({ panelId, userId, username }) => {
      panelManager.raiseHand(panelId, userId);
      networkingNs.to(panelId).emit('hand-raised', {
        userId,
        username,
        participants: panelManager.getParticipantsList(panelId)
      });
    });

    socket.on('lower-hand', ({ panelId, userId }) => {
      panelManager.lowerHand(panelId, userId);
      networkingNs.to(panelId).emit('hand-lowered', {
        userId,
        participants: panelManager.getParticipantsList(panelId)
      });
    });

    socket.on('promote-speaker', ({ panelId, targetUserId, hostId }) => {
      const panel = panelManager.getPanel(panelId);
      if (panel && panel.hostId === hostId) {
        panelManager.promoteToSpeaker(panelId, targetUserId);
        networkingNs.to(panelId).emit('speaker-promoted', {
          userId: targetUserId,
          participants: panelManager.getParticipantsList(panelId)
        });
      }
    });

    socket.on('demote-listener', ({ panelId, targetUserId, hostId }) => {
      const panel = panelManager.getPanel(panelId);
      if (panel && panel.hostId === hostId) {
        panelManager.demoteToListener(panelId, targetUserId);
        networkingNs.to(panelId).emit('listener-demoted', {
          userId: targetUserId,
          participants: panelManager.getParticipantsList(panelId)
        });
      }
    });

    socket.on('request-contact', ({ panelId, fromUserId, toUserId, fromUsername }) => {
      const targetSocket = panelManager.getUserSocket(toUserId);
      if (targetSocket) {
        networkingNs.to(targetSocket).emit('contact-request', {
          fromUserId,
          fromUsername,
          panelId
        });
      }
    });

    socket.on('accept-contact', ({ fromUserId, toUserId }) => {
      userManager.addContact(fromUserId, toUserId);
      userManager.addContact(toUserId, fromUserId);
      
      const fromSocket = panelManager.getUserSocket(fromUserId);
      if (fromSocket) {
        networkingNs.to(fromSocket).emit('contact-accepted', {
          userId: toUserId,
          username: userManager.getUser(toUserId)?.username
        });
      }
      
      socket.emit('contact-accepted', {
        userId: fromUserId,
        username: userManager.getUser(fromUserId)?.username
      });
    });

    socket.on('typing', ({ panelId, userId, username }) => {
      socket.to(panelId).emit('user-typing', { userId, username });
    });

    socket.on('stop-typing', ({ panelId, userId }) => {
      socket.to(panelId).emit('user-stopped-typing', { userId });
    });

    socket.on('disconnect', () => {
      if (currentUserId) {
        userManager.setUserOffline(currentUserId);
        panelManager.handleUserDisconnect(socket.id);
        networkingNs.emit('online-count', { count: userManager.getOnlineCount() });
      }
      console.log('Networking disconnection:', socket.id);
    });
  });

  setInterval(() => {
    panelManager.cleanupExpiredPanels();
  }, 60000);

  return networkingNs;
}

export default setupNetworkingSocket;
