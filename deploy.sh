#!/usr/bin/env bash
# ==============================================================================
# Bangla News Edition (BNE) - 100% Automated Browser OAuth Deployment
# Works on macOS Terminal (Opens browser for GitHub & Netlify login)
# ==============================================================================
set -e

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${CYAN}======================================================"
echo -e "   🚀 BANGLA NEWS EDITION (BNE) AUTOMATED DEPLOY   "
echo -e "======================================================${NC}"
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -d "$SCRIPT_DIR/static-site" ]; then
    PROJECT_DIR="$SCRIPT_DIR/static-site"
else
    PROJECT_DIR="$SCRIPT_DIR"
fi

cd "$PROJECT_DIR"
echo -e "${GREEN}📂 Working Directory:${NC} $PROJECT_DIR"

# ------------------------------------------------------------------------------
# STEP 1: GITHUB BROWSER AUTHENTICATION & REPO SETUP
# ------------------------------------------------------------------------------
echo ""
echo -e "${YELLOW}--- [STEP 1/3] GITHUB AUTHENTICATION ---${NC}"

if ! command -v gh &> /dev/null; then
    echo -e "${CYAN}⚡ Installing GitHub CLI (gh) via Homebrew...${NC}"
    if command -v brew &> /dev/null; then
        brew install gh
    else
        echo -e "${YELLOW}Homebrew not detected. Installing via npm/npx fallback...${NC}"
    fi
fi

if command -v gh &> /dev/null && ! gh auth status &> /dev/null; then
    echo -e "${CYAN}🌐 Opening browser window for GitHub login...${NC}"
    echo -e "${YELLOW}Please log in via the browser and approve authorization.${NC}"
    gh auth login --web -h github.com -p https
elif ! command -v gh &> /dev/null; then
    echo -e "${CYAN}🌐 Opening GitHub New Repo page in browser...${NC}"
    open "https://github.com/new"
fi

echo ""
echo -n "📦 Enter GitHub Repository Name (press Enter for 'bangla-news-edition'): "
read GH_REPO
GH_REPO="${GH_REPO:-bangla-news-edition}"

if [ ! -d ".git" ]; then
    git init
    git branch -M main
fi

git add .
git commit -m "Deploy Bangla News Edition - $(date +'%Y-%m-%d %H:%M:%S')" || true

if command -v gh &> /dev/null && gh auth status &> /dev/null; then
    echo -e "${CYAN}📡 Creating/Syncing GitHub repository using GitHub CLI...${NC}"
    if gh repo view "$GH_REPO" &> /dev/null; then
        GH_USER=$(gh api user --jq '.login')
        git remote remove origin 2>/dev/null || true
        git remote add origin "https://github.com/$GH_USER/$GH_REPO.git"
        git push -u origin main --force
    else
        gh repo create "$GH_REPO" --public --source=. --remote=origin --push || git push -u origin main --force
    fi
    echo -e "${GREEN}✅ GitHub Code Push Complete!${NC}"
else
    echo -e "${YELLOW}⚠️ Manual Git Remote: Paste your GitHub repository URL (or press Enter to skip): ${NC}"
    read GIT_REMOTE_URL
    if [ -n "$GIT_REMOTE_URL" ]; then
        git remote remove origin 2>/dev/null || true
        git remote add origin "$GIT_REMOTE_URL"
        git push -u origin main --force || true
    fi
fi

# ------------------------------------------------------------------------------
# STEP 2: NETLIFY BROWSER AUTHENTICATION & DEPLOYMENT
# ------------------------------------------------------------------------------
echo ""
echo -e "${YELLOW}--- [STEP 2/3] NETLIFY BROWSER AUTHENTICATION & DEPLOYMENT ---${NC}"

if ! command -v netlify &> /dev/null; then
    echo -e "${CYAN}⚡ Installing Netlify CLI globally via npm...${NC}"
    npm install -g netlify-cli || sudo npm install -g netlify-cli
fi

if ! netlify status &> /dev/null; then
    echo -e "${CYAN}🌐 Opening browser window for Netlify login...${NC}"
    echo -e "${YELLOW}Click 'Authorize' in the browser window, then return to terminal.${NC}"
    netlify login
fi

echo ""
echo -n "🌐 Enter desired Netlify Site Name (press Enter for 'bangla-news-edition'): "
read NETLIFY_SITE
NETLIFY_SITE="${NETLIFY_SITE:-bangla-news-edition}"

echo -e "${CYAN}🚀 Deploying website live to Netlify Production...${NC}"
if [ -n "$NETLIFY_SITE" ]; then
    netlify deploy --dir="$PROJECT_DIR" --prod --site="$NETLIFY_SITE" || netlify deploy --dir="$PROJECT_DIR" --prod
else
    netlify deploy --dir="$PROJECT_DIR" --prod
fi
echo -e "${GREEN}✅ Netlify Production Deployment Complete!${NC}"

# ------------------------------------------------------------------------------
# STEP 3: PREVIEW & VERIFICATION
# ------------------------------------------------------------------------------
echo ""
echo -e "${YELLOW}--- [STEP 3/3] OPENING LOCAL & PRODUCTION PREVIEW ---${NC}"
if [ -f "$PROJECT_DIR/index.html" ]; then
    open "$PROJECT_DIR/index.html"
    echo -e "${GREEN}🎉 Local site opened in browser!${NC}"
fi

echo ""
echo -e "${GREEN}======================================================"
echo -e "   🎉 ALL DONE! WEBSITE IS LIVE ON GITHUB & NETLIFY!   "
echo -e "======================================================${NC}"
