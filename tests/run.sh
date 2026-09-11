#!/usr/bin/env bash
# 一纸成文 · 测试套件入口
# 用法：bash tests/run.sh
set -e
cd "$(dirname "$0")/.."
echo "== 引擎与功能测试 =="
node tests/engine.test.mjs
echo
echo "== 全部通过 =="
