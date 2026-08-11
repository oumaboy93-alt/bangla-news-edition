#!/usr/bin/env bash
# ==============================================================================
# Bangla News Edition (BNE) - Automated Deployment Script
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
# STEP 1: GITHUB CODE SYNC
# ------------------------------------------------------------------------------
echo ""
echo -e "${YELLOW}--- [STEP 1/2] GITHUB CODE SYNC ---${NC}"

git add .
git commit -m "Deploy Bangla News Edition - $(date +'%Y-%m-%d %H:%M:%S')" || true

if command -v gh &> /dev/null && gh auth status &> /dev/null; then
    echo -e "${CYAN}📡 Synchronizing with GitHub...${NC}"
    git push -u origin main --force || true
    echo -e "${GREEN}✅ GitHub Code Push Complete!${NC}"
fi

# ------------------------------------------------------------------------------
# STEP 2: NETLIFY PRODUCTION DEPLOY
# ------------------------------------------------------------------------------
echo ""
echo -e "${YELLOW}--- [STEP 2/2] NETLIFY PRODUCTION DEPLOYMENT ---${NC}"

if ! netlify status &> /dev/null; then
    echo -e "${CYAN}🌐 Opening Netlify Login...${NC}"
    netlify login
fi

echo -e "${CYAN}🚀 Deploying portal live to Netlify Production...${NC}"
netlify deploy --prod

echo ""
echo -e "${GREEN}======================================================"
echo -e "   🎉 ALL DONE! BANGLA NEWS EDITION IS LIVE!         "
echo -e "======================================================${NC}"

# Open local preview
open "$PROJECT_DIR/index.html"
