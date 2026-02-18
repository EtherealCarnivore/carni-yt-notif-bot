import { Client, GatewayIntentBits, EmbedBuilder } from 'discord.js';
import Parser from 'rss-parser';
import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const parser = new Parser();
const CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

// Discord bot setup
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
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

  // Create embed
  const embed = new EmbedBuilder()
    .setColor('#FF0000')
    .setTitle(video.title)
    .setURL(videoUrl)
    .setDescription(video.contentSnippet || 'No description available')
    .setAuthor({
      name: feed.title || 'YouTube Channel',
      iconURL: 'https://www.youtube.com/s/desktop/d743f786/img/favicon_144x144.png'
    })
    .setTimestamp(new Date(video.pubDate))
    .setFooter({ text: 'New Video Uploaded' });

  // Add thumbnail if available
  if (video.media && video.media.thumbnail) {
    embed.setImage(video.media.thumbnail.url);
  }

  // Role mention (if configured)
  const content = process.env.DISCORD_ROLE_ID
    ? `<@&${process.env.DISCORD_ROLE_ID}> 🎬 **New video uploaded!**\n${videoUrl}`
    : `🎬 **New video uploaded!**\n${videoUrl}`;

  try {
    await notificationChannel.send({ content, embeds: [embed] });
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

// Start Express server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌐 Test server listening on port ${PORT}`);
});

// Login to Discord
client.login(process.env.DISCORD_TOKEN);
