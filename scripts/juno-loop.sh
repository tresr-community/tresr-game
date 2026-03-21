#!/usr/bin/env bash

clear
set -euo pipefail

VERSION="0.0.0"

while true; do

	RUN_LOOP=true

	echo "Staging changed files..."
	git add --all || {
		echo "Failed to stage files"
		exit 1
	}

	echo "####################################################################"
	echo "Starting Juno development loop..."
	echo "####################################################################"

	echo "##################################"
	echo "Updating Solidity Contracts..."
	echo "##################################"

	if [ "$RUN_LOOP" = true ]; then
		solidity-dev loop || {
			RUN_LOOP=false
			echo "Solidity Contracts deployment has failed, will retry loop..."
		}
	fi

	echo "##################################"
	echo "Updating Frontend..."
	echo "##################################"

	if [ "$RUN_LOOP" = true ]; then
		juno-dev loop || {
			RUN_LOOP=false
			echo "Juno development loop, will retry loop..."
		}
	fi

	# The pre-build will bump the version number.
	if [[ -f package.json ]]; then
		VERSION=$(cat package.json | jq -r .version)
	fi

	echo "####################################################################"
	echo "Completed loop for version $VERSION. Waiting for next iteration..."
	echo "####################################################################"

	read -rp "Press Enter to start next loop..."

done
