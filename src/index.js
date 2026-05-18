import { Client, GatewayIntentBits, EmbedBuilder } from 'discord.js';
import Parser from 'rss-parser';
import express from 'express';
import dotenv from 'dotenv';
import { mountMembershipRoutes } from './membership/routes.js';
import { registerCommands, attachInteractionHandler } from './membership/commands.js';
import { reconcile } from './membership/reconcile.js';
import { RECONCILE_INTERVAL_MS } from './membership/config.js';
import { attachWelcomeDmHandler } from './membership/welcome.js';
import { buildLinkYouTubeRow } from './membership/linkButton.js';

dotenv.config();

// Verify required environment variables
const required = ['DISCORD_TOKEN', 'DISCORD_CHANNEL_ID', 'YOUTUBE_RSS_URL'];
const missing = required.filter(key => !process.env[key]);
if (missing.length > 0) {
  console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const MEMBERSHIP_ENABLED = !!(
  process.env.DISCORD_GUILD_ID &&
  process.env.DISCORD_CLIENT_ID &&
  process.env.DISCORD_CLIENT_SECRET &&
  process.env.SE_JWT &&
  process.env.PUBLIC_BASE_URL
);
if (!MEMBERSHIP_ENABLED) {
  console.warn('⚠️ Membership sync disabled — missing one or more of: DISCORD_GUILD_ID, DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, SE_JWT, PUBLIC_BASE_URL');
}

console.log('✅ Environment variables loaded');
console.log(`   - Channel ID: ${process.env.DISCORD_CHANNEL_ID}`);
console.log(`   - Role ID: ${process.env.DISCORD_ROLE_ID || 'not set'}`);
console.log(`   - Token: ${process.env.DISCORD_TOKEN ? '***' + process.env.DISCORD_TOKEN.slice(-10) : 'MISSING'}`);

const app = express();
const parser = new Parser();
const CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

// Discord bot setup
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers, // privileged — enable in dev portal
  ]
});

let notificationChannel = null;
let lastVideoId = null;

client.once('ready', async () => {
  console.log(`✅ Bot logged in as ${client.user.tag}`);

  // Get the notification channel
  try {
    notificationChannel = await client.channels.fetch(process.env.DISCORD_CHANNEL_ID);
    console.log(`✅ Connected to channel: ${notificationChannel.name}`);
  } catch (error) {
    console.error('❌ Could not fetch notification channel:', error.message);
    return;
  }

  // Initialize with latest video (don't notify on startup)
  await initializeLastVideo();

  // Start polling
  console.log(`🔄 Starting YouTube RSS polling (every ${CHECK_INTERVAL / 60000} minutes)`);
  setInterval(checkForNewVideos, CHECK_INTERVAL);

  // Membership sync
  if (MEMBERSHIP_ENABLED) {
    try {
      await registerCommands();
      attachInteractionHandler(client);
      attachWelcomeDmHandler(client);
      console.log(`🔁 Starting membership reconcile loop (every ${RECONCILE_INTERVAL_MS / 60000} minutes)`);
      setInterval(() => reconcile(client).catch(e => console.error('reconcile error:', e.message)), RECONCILE_INTERVAL_MS);
      reconcile(client).catch(e => console.error('initial reconcile error:', e.message));
    } catch (e) {
      console.error('❌ Membership setup failed:', e.message);
    }
  }
});

async function initializeLastVideo() {
  try {
    const feed = await parser.parseURL(process.env.YOUTUBE_RSS_URL);
    if (feed.items && feed.items.length > 0) {
      lastVideoId = feed.items[0].id;
      console.log(`📌 Initialized with latest video: ${feed.items[0].title}`);
    }
  } catch (error) {
    console.error('❌ Error initializing:', error.message);
  }
}

async function checkForNewVideos() {
  try {
    const feed = await parser.parseURL(process.env.YOUTUBE_RSS_URL);

    if (!feed.items || feed.items.length === 0) {
      console.log('⚠️ No videos found in feed');
      return;
    }

    const latestVideo = feed.items[0];

    // Check if this is a new video
    if (lastVideoId && latestVideo.id === lastVideoId) {
      console.log('✓ No new videos');
      return;
    }

    // New video detected!
    console.log(`🎥 New video detected: ${latestVideo.title}`);
    lastVideoId = latestVideo.id;

    // Send notification
    await sendVideoNotification(latestVideo, feed);

  } catch (error) {
    console.error('❌ Error checking for videos:', error.message);
  }
}

async function sendVideoNotification(video, feed) {
  if (!notificationChannel) {
    console.error('❌ Notification channel not available');
    return;
  }

  // Extract video ID from the link
  const videoId = video.id.split(':').pop();
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

  // Role mention + message (Discord will auto-embed the YouTube link)
  const content = process.env.DISCORD_ROLE_ID
    ? `<@&${process.env.DISCORD_ROLE_ID}> 🎬 **New video from ${feed.title}!**\n\n**${video.title}**\n${videoUrl}`
    : `🎬 **New video from ${feed.title}!**\n\n**${video.title}**\n${videoUrl}`;

  const components = MEMBERSHIP_ENABLED ? [buildLinkYouTubeRow()] : [];

  try {
    await notificationChannel.send({ content, components });
    console.log(`✅ Notification sent for: ${video.title}`);
  } catch (error) {
    console.error('❌ Error sending notification:', error.message);
  }
}

// Test endpoint to manually trigger notification with latest video
app.get('/test', async (req, res) => {
  try {
    const feed = await parser.parseURL(process.env.YOUTUBE_RSS_URL);

    if (!feed.items || feed.items.length === 0) {
      return res.status(404).json({ error: 'No videos found' });
    }

    const latestVideo = feed.items[0];

    if (!notificationChannel) {
      return res.status(500).json({ error: 'Bot not connected to channel' });
    }

    await sendVideoNotification(latestVideo, feed);

    res.json({
      success: true,
      video: latestVideo.title,
      url: `https://www.youtube.com/watch?v=${latestVideo.id.split(':').pop()}`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    bot: client.user?.tag || 'not ready',
    channel: notificationChannel?.name || 'not connected',
    lastVideo: lastVideoId || 'none',
    uptime: process.uptime()
  });
});

if (MEMBERSHIP_ENABLED) {
  mountMembershipRoutes(app, client);
}

// Start Express server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌐 Test server listening on port ${PORT}`);
});

// Login to Discord with error handling
console.log('🔑 Attempting to login to Discord...');
client.login(process.env.DISCORD_TOKEN).catch(error => {
  console.error('❌ Failed to login to Discord:', error.message);
  process.exit(1);
});
