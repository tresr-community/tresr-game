#!/bin/bash

# Configuration
SETTINGS_FILE="$HOME/.gemini/settings.json"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}--- Gemini CLI MCP & Config Debugger ---${NC}"

# 1. Check if settings file exists
if [ ! -f "$SETTINGS_FILE" ]; then
	echo -e "${RED}Error: Settings file not found at $SETTINGS_FILE${NC}"
	exit 1
fi

# 2. Check for required Environment Variables
# We look for variables referenced in your settings file: GITHUB_TOKEN, DAISYUI_LICENSE, DAISYUI_EMAIL
echo -e "\n${YELLOW}Checking Environment Variables...${NC}"

MISSING_VARS=0

check_var() {
	if [[ -z ${!1} ]]; then
		echo -e "${RED}✖ $1 is NOT set.${NC}"
		MISSING_VARS=1
	else
		# Show first 4 chars for verification, hide the rest
		echo -e "${GREEN}✔ $1 is set (${!1:0:4}...)${NC}"
	fi
}

check_var "GITHUB_TOKEN"
check_var "DAISYUI_LICENSE"
check_var "DAISYUI_EMAIL"

if [ $MISSING_VARS -eq 1 ]; then
	echo -e "\n${RED}Warning: Some secrets are missing from your environment.${NC}"
	echo "The CLI will load, but these MCP servers will likely fail to connect."
	read -p "Continue anyway? (y/n) " -n 1 -r
	echo
	if [[ ! $REPLY =~ ^[Yy]$ ]]; then
		exit 1
	fi
else
	echo -e "${GREEN}All environment variables appear to be present.${NC}"
fi

# 3. Simulate the JSON Parsing (Dry Run)
# This uses Node to attempt the exact string replacement the CLI performs
echo -e "\n${YELLOW}Verifying JSON Interpolation...${NC}"

if node -e "
const fs = require('fs');
const path = require('path');

try {
    const settingsPath = path.resolve(process.env.HOME, '.gemini/settings.json');
    let rawData = fs.readFileSync(settingsPath, 'utf8');

    // Simple regex to find \${VAR} patterns
    const regex = /\\$\\{([^}]+)\\}/g;
    let match;
    let errors = 0;

    console.log('Scanning settings.json for variable placeholders:');

    while ((match = regex.exec(rawData)) !== null) {
        const varName = match[1];
        const envValue = process.env[varName];

        if (!envValue) {
            console.log('  \x1b[31m✖ Found \${' + varName + '} but env var is empty/missing.\x1b[0m');
            errors++;
        } else {
            console.log('  \x1b[32m✔ Found \${' + varName + '} -> Replaces successfully.\x1b[0m');
        }
    }

    // Check JSON validity
    JSON.parse(rawData);
    console.log('  \x1b[32m✔ JSON syntax is valid.\x1b[0m');

    if (errors > 0) process.exit(1);

} catch (e) {
    console.error('\x1b[31mError processing JSON:\x1b[0m', e.message);
    process.exit(1);
}
"; then
	echo -e "\n${GREEN}Configuration looks valid! Launching Gemini...${NC}"
	echo -e "${YELLOW}Once inside, type '/mcp' to confirm the servers are green.${NC}\n"

	# Launch the actual CLI
	gemini
else
	echo -e "\n${RED}Configuration check failed. Please fix the errors above.${NC}"
	exit 1
fi
