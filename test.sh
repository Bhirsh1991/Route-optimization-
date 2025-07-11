#!/usr/bin/env bash
set -e

if [ ! -f index.html ]; then
  echo "index.html not found"
  exit 1
fi

if ! grep -q "<title>.*</title>" index.html; then
  echo "title tag missing"
  exit 1
fi

echo "All checks passed."
