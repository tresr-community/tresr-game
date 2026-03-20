#!/usr/bin/env bash

# 1. Hard reset to discard any modified files inside submodules
git submodule foreach --recursive git reset --hard || {
	echo "Failed to reset git submodules"
	exit 1
}

# 2. Clean out any untracked or ignored files inside submodules
git submodule foreach --recursive git clean -xfd || {
	echo "Failed to clean git submodules"
	exit 1
}

# 3. Update them to the correct commits expected by the parent repo
git submodule update --init --recursive || {
	echo "Failed to update git submodules"
	exit 1
}
