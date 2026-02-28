build:
	npm run package

install: build
	npx @vscode/vsce package --no-dependencies
	cursor --install-extension vsc-orca-$(shell node -p "require('./package.json').version").vsix

PHONY: build install