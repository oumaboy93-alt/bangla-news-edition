#!/bin/bash
echo "======================================================"
echo "🚀 BANGLA NEWS EDITION — ONE-CLICK AUTO-POSTER SETUP"
echo "======================================================"
echo "📂 Setting up background daily automation on your Mac..."

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

# Install Playwright silently if missing
npm list playwright >/dev/null 2>&1 || npm install playwright

# Execute FB Group Poster immediately
node fb_group_bot.js

# Setup local Mac cron job to run daily at 9:00 AM
(crontab -l 2>/dev/null | grep -v "fb_group_bot.js" ; echo "0 9 * * * cd \"$DIR\" && /usr/local/bin/node fb_group_bot.js >> fb_bot.log 2>&1") | crontab -

echo "======================================================"
echo "🎉 SUCCESS! Daily Automation is active on your Mac."
echo "You never need to open Terminal again!"
echo "======================================================"
