import { Router } from 'express';
import { panelManager } from './panelManager';
import { timePackManager } from './timePackManager';
import { userManager } from './userManager';

const router = Router();

router.get('/panels', (req, res) => {
  const panels = panelManager.getActivePanels();
  res.json({ panels });
});

router.get('/panels/:panelId', (req, res) => {
  const { panelId } = req.params;
  const state = panelManager.getPanelState(panelId);
  
  if (state) {
    res.json({ panel: state });
  } else {
    res.status(404).json({ error: 'Panel not found' });
  }
});

router.post('/panels/create', async (req: any, res) => {
  const userId = req.session?.userId;
  const username = req.session?.username || 'Host';
  
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { topic, isPrivate } = req.body;
  
  const userTime = await timePackManager.getUserTime(userId);
  if (userTime < 15) {
    return res.status(400).json({ 
      error: 'Insufficient time credits',
      required: 15,
      available: userTime
    });
  }
  
  const panel = panelManager.createPanel({
    hostId: userId,
    hostUsername: username,
    topic: topic || 'Open Discussion',
    isPrivate: !!isPrivate,
    maxParticipants: 9
  });
  
  await timePackManager.deductTime(userId, 15);
  
  res.json({ 
    panel: panelManager.getPanelState(panel.id),
    timeBalance: await timePackManager.getUserTime(userId)
  });
});

router.post('/panels/join/:panelId', async (req: any, res) => {
  const { panelId } = req.params;
  const userId = req.session?.userId;
  const username = req.session?.username || 'User';
  
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const success = panelManager.joinPanel(panelId, userId, username);
  if (success) {
    userManager.setUserPanel(userId, panelId);
    res.json({ 
      message: 'Joined room successfully',
      panel: panelManager.getPanelState(panelId)
    });
  } else {
    res.status(400).json({ error: 'Room is full or not found' });
  }
});

router.post('/panels/leave/:panelId', async (req: any, res) => {
  const { panelId } = req.params;
  const userId = req.session?.userId;
  
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const success = panelManager.leavePanel(panelId, userId);
  if (success) {
    userManager.setUserPanel(userId, undefined);
    res.json({ message: 'Left room successfully' });
  } else {
    res.status(400).json({ error: 'Room not found' });
  }
});

router.post('/panels/add-time/:panelId', async (req: any, res) => {
  const { panelId } = req.params;
  const userId = req.session?.userId;
  const { minutes } = req.body;
  
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const parsedMinutes = parseInt(minutes, 10);
  if (isNaN(parsedMinutes) || parsedMinutes < 5 || parsedMinutes > 60) {
    return res.status(400).json({ error: 'Minutes must be between 5 and 60' });
  }
  
  const panel = panelManager.getPanel(panelId);
  if (!panel) {
    return res.status(404).json({ error: 'Room not found' });
  }
  
  if (panel.hostId !== userId) {
    return res.status(403).json({ error: 'Not authorized - only host can add time' });
  }
  
  const hasTime = await timePackManager.checkTime(userId, parsedMinutes);
  if (!hasTime) {
    return res.status(400).json({ error: 'Insufficient time credits' });
  }
  
  panelManager.extendPanelTime(panelId, parsedMinutes);
  await timePackManager.deductTime(userId, parsedMinutes);
  
  res.json({ 
    message: `Room extended by ${parsedMinutes} minutes`,
    panel: panelManager.getPanelState(panelId),
    timeBalance: await timePackManager.getUserTime(userId)
  });
});

router.post('/panels/raise-hand/:panelId', async (req: any, res) => {
  const { panelId } = req.params;
  const userId = req.session?.userId;
  
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const success = panelManager.raiseHand(panelId, userId);
  if (success) {
    res.json({ message: 'Hand raised' });
  } else {
    res.status(400).json({ error: 'Failed to raise hand' });
  }
});

router.post('/panels/promote/:panelId/:targetUserId', async (req: any, res) => {
  const { panelId, targetUserId } = req.params;
  const userId = req.session?.userId;
  
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const panel = panelManager.getPanel(panelId);
  if (!panel || panel.hostId !== userId) {
    return res.status(403).json({ error: 'Only host can promote speakers' });
  }
  
  const success = panelManager.promoteToSpeaker(panelId, parseInt(targetUserId));
  if (success) {
    res.json({ message: 'User promoted to speaker' });
  } else {
    res.status(400).json({ error: 'Failed to promote user' });
  }
});

router.get('/time-packs', (req, res) => {
  const packs = timePackManager.getAvailablePacks();
  res.json({ packs });
});

router.get('/time-balance', async (req: any, res) => {
  const userId = req.session?.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const balance = await timePackManager.getUserTime(userId);
  res.json({ balance });
});

router.post('/time-packs/purchase', async (req: any, res) => {
  const userId = req.session?.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const { packId } = req.body;
  const result = await timePackManager.purchasePack(userId, packId);
  
  if (result.success) {
    res.json(result);
  } else {
    res.status(400).json({ error: result.message });
  }
});

router.get('/online-count', (req, res) => {
  const count = userManager.getOnlineCount();
  res.json({ count });
});

router.get('/user/:userId/profile', (req, res) => {
  const userId = parseInt(req.params.userId);
  const profile = userManager.getUserProfile(userId);
  
  if (profile) {
    res.json({ profile });
  } else {
    res.status(404).json({ error: 'User not found' });
  }
});

router.post('/contacts/add', async (req: any, res) => {
  const userId = req.session?.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const { contactId } = req.body;
  const success = userManager.addContact(userId, contactId);
  
  if (success) {
    res.json({ message: 'Contact added' });
  } else {
    res.status(400).json({ error: 'Failed to add contact' });
  }
});

router.get('/contacts', async (req: any, res) => {
  const userId = req.session?.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const contacts = userManager.getContacts(userId);
  res.json({ contacts });
});

export default router;
