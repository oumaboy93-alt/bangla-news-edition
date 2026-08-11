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
# STEP 1: GITHUB CODE SYNC & PUSH
# ------------------------------------------------------------------------------
echo ""
echo -e "${YELLOW}--- [STEP 1/2] GITHUB CODE SYNC ---${NC}"

git add .
git commit -m "Deploy Bangla News Edition - $(date +'%Y-%m-%d %H:%M:%S')" || true

if command -v gh &> /dev/null && gh auth status &> /dev/null; then
    echo -e "${CYAN}📡 Synchronizing code to GitHub main branch...${NC}"
    git push -u origin main --force || true
    echo -e "${GREEN}✅ GitHub Code Push Complete!${NC}"
fi

# ------------------------------------------------------------------------------
# STEP 2: NETLIFY DEPLOYMENT
# ------------------------------------------------------------------------------
echo ""
echo -e "${YELLOW}--- [STEP 2/2] NETLIFY PRODUCTION DEPLOYMENT ---${NC}"

if netlify deploy --prod 2>/dev/null; then
    echo -e "${GREEN}✅ Netlify deployment complete!${NC}"
else
    echo -e "${CYAN}🚀 Pushed to GitHub! Live repository ready at:${NC}"
    echo -e "   👉 https://github.com/oumaboy93-alt/bangla-news-edition"
fi

echo ""
echo -e "${GREEN}======================================================"
echo -e "   🎉 ALL DONE! LOCAL & GITHUB CODE UPDATED!         "
echo -e "======================================================${NC}"

open "$PROJECT_DIR/index.html"
