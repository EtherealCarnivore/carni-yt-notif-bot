# Carni YouTube Notification Bot

Discord bot that automatically notifies when new videos are uploaded to a YouTube channel.

## Features

- 🎬 **Automatic Notifications**: Checks RSS feed every 5 minutes
- 📺 **Rich Embeds**: Shows video title, description, and thumbnail
- 🔗 **Direct Links**: Discord auto-shows video preview
- 📢 **Role Mentions**: Optional @role ping for notifications
- 🚀 **No API Keys**: Uses YouTube RSS (no quotas or limits)

## How It Works

Uses YouTube's public RSS feed to check for new videos. When a new video is detected:
1. Posts video URL (Discord shows preview automatically)
2. Sends rich embed with details
3. Mentions role (if configured)

## Setup Guide

### 1. Create Discord Bot

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" → Name it "YouTube Notifier"
3. Go to "Bot" section → Click "Add Bot"
4. Copy the **Token**
5. Enable "Message Content Intent"
6. Invite bot to your server:
   - OAuth2 → URL Generator
   - Scopes: `bot`
   - Permissions: `Send Messages`, `Embed Links`

### 2. Get IDs

**Channel ID:**
- Enable Developer Mode in Discord
- Right-click your notification channel → "Copy Channel ID"

**Role ID (optional):**
- Right-click the role → "Copy Role ID"

**YouTube Channel ID:**
- Visit: `https://www.youtube.com/@YourHandle`
- View page source → Search for `"channelId":"` → Copy the ID
- Or use this tool: https://commentpicker.com/youtube-channel-id.php

### 3. Local Development

```bash
# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Edit .env with your values:
# DISCORD_TOKEN=your_bot_token
# DISCORD_CHANNEL_ID=your_channel_id
# DISCORD_ROLE_ID=your_role_id (optional)
# YOUTUBE_RSS_URL=https://www.youtube.com/feeds/videos.xml?channel_id=YOUR_CHANNEL_ID

# Run locally
npm run dev
```

### 4. Deploy to Railway

1. Push this repo to GitHub
2. Go to [Railway.app](https://railway.app) → "New Project" → "Deploy from GitHub repo"
3. Select `carni-yt-notif-bot` repository
4. Add environment variables:
   - `DISCORD_TOKEN`
   - `DISCORD_CHANNEL_ID`
   - `DISCORD_ROLE_ID` (optional)
   - `YOUTUBE_RSS_URL`

Railway will auto-deploy and keep running 24/7.

## Configuration

### RSS URL Format
```
https://www.youtube.com/feeds/videos.xml?channel_id=CHANNEL_ID
```

Replace `CHANNEL_ID` with the actual YouTube channel ID.

### Check Interval
Default: 5 minutes (300000ms)

To change, edit `CHECK_INTERVAL` in `src/index.js`:
```javascript
const CHECK_INTERVAL = 10 * 60 * 1000; // 10 minutes
```

## Testing

### Test with Real Channel
The bot will automatically detect the latest video on startup (without notifying).
When the next video is uploaded, you'll get a notification.

### Manual Test
You can temporarily lower the check interval to 1 minute for testing:
```javascript
const CHECK_INTERVAL = 1 * 60 * 1000; // 1 minute
```

## Troubleshooting

**Bot not detecting videos?**
- Verify `YOUTUBE_RSS_URL` is correct
- Check Railway logs for errors
- Test RSS feed manually: Visit the URL in browser

**No notifications?**
- Check `DISCORD_CHANNEL_ID` is correct
- Verify bot has permissions in channel
- Look at Railway logs for "New video detected"

**Role not getting pinged?**
- Verify `DISCORD_ROLE_ID` is correct
- Check role is mentionable (Server Settings → Roles → Allow anyone to mention)

## Cost

Railway free tier: ~$5 credit/month (enough for this bot)

## Example Notification

When a new video is uploaded, Discord shows:
```
@DevTeam 🎬 New video uploaded!
https://www.youtube.com/watch?v=VIDEO_ID

[Rich Embed with title, description, thumbnail]
```

Discord automatically embeds the YouTube video with preview player.
