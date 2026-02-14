#!/usr/bin/env bash

clear
set -euo pipefail

VERSION="0.0.0"

while true; do

	RUN_LOOP=true

	echo "##################################"
	echo "Starting Juno development loop..."
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

	echo "##################################"
	echo "Completed loop for version $VERSION. Waiting for next iteration..."
	echo "##################################"

	read -rp "Press Enter to start next loop..."

done
