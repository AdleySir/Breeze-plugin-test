# Breeze Pixiv Plugin

A Breeze plugin for searching Pixiv illustrations and manga, viewing artwork details, and reading/downloading multi-page works.

## Development

Requirements: Node.js 22+, pnpm 10+ and Git.

~~~powershell
pnpm install
pnpm run dev
~~~

The development server prints a bundle URL. In Breeze, install it through Discover > Settings > Plugin Store > Browse Install > Network Install, then enable debug mode in the plugin settings and enter the same bundle URL.

To build a distributable bundle:

~~~powershell
pnpm run build
~~~

The bundle is written to dist.

## Pixiv account login

Open the Pixiv plugin settings and choose the account login entry. Enter your Pixiv ID or email and password. The plugin sends these credentials directly to Pixiv OAuth over HTTPS to obtain an access token and refresh token. It does not save or log the password; only the refresh token and account name are stored in Breeze plugin configuration.

This uses Pixiv's unofficially documented password grant. Pixiv may reject it due to account security checks, CAPTCHA, two-factor authentication, or service-side changes. A browser-based PKCE login flow is not implemented yet.

## Features

- Search Pixiv illustrations and manga, with pagination
- View artwork details, creator, tags, bookmark count, and view count
- Read single-page and multi-page works
- Download original images

Bookmark actions, comments, novels, and ranking feeds are not implemented yet.

Pixiv API reference: https://github.com/Arvinsyt/Pixiv-API  
Breeze plugin guide: https://github.com/deretame/plugin-dev-docs

This project is independent and is not affiliated with Pixiv Inc.