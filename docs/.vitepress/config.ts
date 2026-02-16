import { defineConfig } from "vitepress";

export default defineConfig({
	title: "Polybot SDK",
	description: "Production-grade Polymarket trading bot SDK for TypeScript",
	base: "/polybot-ts/",
	lastUpdated: true,
	cleanUrls: true,
	ignoreDeadLinks: [/\/api\//, /\/_media\//, /^\/CHANGELOG$/],
	head: [["link", { rel: "icon", href: "/favicon.ico" }]],
	themeConfig: {
		logo: "/logo.svg",
		siteTitle: "Polybot SDK",
		nav: [
			{ text: "Home", link: "/" },
			{ text: "Getting Started", link: "/getting-started/installation" },
			{ text: "Concepts", link: "/concepts/architecture" },
			{ text: "Guides", link: "/guides/strategy-builder" },
			{ text: "API Reference", link: "/api/README" },
		],
		sidebar: {
			"/getting-started/": [
				{
					text: "Getting Started",
					items: [
						{ text: "Installation", link: "/getting-started/installation" },
						{ text: "Quick Start", link: "/getting-started/quick-start" },
						{ text: "Authentication", link: "/getting-started/authentication" },
						{ text: "Configuration", link: "/getting-started/configuration" },
						{ text: "Paper Trading", link: "/getting-started/paper-trading" },
					],
				},
			],
			"/concepts/": [
				{
					text: "Core Concepts",
					items: [
						{ text: "Architecture", link: "/concepts/architecture" },
						{ text: "Signal Detector", link: "/concepts/signal-detector" },
						{ text: "Decimal Precision", link: "/concepts/decimal-precision" },
						{ text: "Branded Types", link: "/concepts/branded-types" },
						{ text: "Immutability", link: "/concepts/immutability" },
						{ text: "Result Pattern", link: "/concepts/result-pattern" },
						{ text: "Clock Injection", link: "/concepts/clock-injection" },
						{ text: "Library Wrapping", link: "/concepts/library-wrapping" },
					],
				},
			],
			"/guides/": [
				{
					text: "Trading Core",
					items: [
						{ text: "Strategy Builder", link: "/guides/strategy-builder" },
						{ text: "Risk Management", link: "/guides/risk-management" },
						{ text: "Exit Strategies", link: "/guides/exit-strategies" },
						{ text: "Position Tracking", link: "/guides/position-tracking" },
						{ text: "Order Management", link: "/guides/order-management" },
					],
				},
				{
					text: "Analytics & Quantitative",
					items: [
						{ text: "Analytics", link: "/guides/analytics" },
						{ text: "Microstructure", link: "/guides/microstructure" },
						{ text: "Backtesting", link: "/guides/backtesting" },
						{ text: "Pricing Models", link: "/guides/pricing-models" },
						{ text: "Position Sizing", link: "/guides/sizing" },
					],
				},
				{
					text: "Advanced Trading",
					items: [
						{ text: "Market Operations", link: "/guides/market-operations" },
						{ text: "Multi-Market Strategies", link: "/guides/multi-market" },
						{ text: "CTF Operations", link: "/guides/ctf-operations" },
					],
				},
				{
					text: "Infrastructure",
					items: [
						{ text: "WebSocket Feeds", link: "/guides/websocket-feeds" },
						{ text: "Market Discovery", link: "/guides/market-discovery" },
						{ text: "Events", link: "/guides/events" },
						{ text: "Persistence", link: "/guides/persistence" },
						{ text: "Error Handling", link: "/guides/error-handling" },
						{ text: "Debugging", link: "/guides/debugging" },
						{ text: "Observability", link: "/guides/observability" },
					],
				},
			],
			"/api/": [
				{
					text: "API Reference",
					items: [
						{ text: "Overview", link: "/api/README" },
						{ text: "Classes", link: "/api/classes" },
						{ text: "Interfaces", link: "/api/interfaces" },
						{ text: "Functions", link: "/api/functions" },
						{ text: "Type Aliases", link: "/api/type-aliases" },
					],
				},
			],
			"/examples/": [
				{
					text: "Examples",
					items: [
						{ text: "Overview", link: "/examples/" },
						{ text: "Simple Arbitrage", link: "/examples/simple-arb" },
						{ text: "EV Hunter", link: "/examples/ev-hunter" },
						{ text: "Conservative MM", link: "/examples/conservative-mm" },
						{ text: "Scanner Strategy", link: "/examples/scanner-strategy" },
						{ text: "Backtest Demo", link: "/examples/backtest-example" },
						{ text: "Microstructure Demo", link: "/examples/microstructure-example" },
						{ text: "Pricing Demo", link: "/examples/pricing-example" },
						{ text: "Paper Backtest", link: "/examples/paper-backtest" },
						{ text: "Live Paper Loop", link: "/examples/live-paper-loop" },
						{ text: "Indicator Showcase", link: "/examples/indicator-showcase" },
					],
				},
			],
			"/contributing/": [
				{
					text: "Contributing",
					items: [
						{ text: "Overview", link: "/contributing/" },
						{ text: "Adding Guards", link: "/contributing/adding-guards" },
						{ text: "Adding Exits", link: "/contributing/adding-exits" },
						{ text: "Adding Strategies", link: "/contributing/adding-strategies" },
						{ text: "Adding Indicators", link: "/contributing/adding-indicators" },
					],
				},
			],
			"/glossary": [
				{
					text: "Reference",
					items: [
						{ text: "Glossary", link: "/glossary" },
						{ text: "FAQ", link: "/faq" },
					],
				},
			],
			"/faq": [
				{
					text: "Reference",
					items: [
						{ text: "Glossary", link: "/glossary" },
						{ text: "FAQ", link: "/faq" },
					],
				},
			],
		},
		socialLinks: [{ icon: "github", link: "https://github.com/HugoLopes45/polybot-ts" }],
		footer: {
			message: 'Released under the MIT License. <a href="https://github.com/HugoLopes45/polybot-ts/blob/main/CHANGELOG.md">Changelog</a> · <a href="https://github.com/HugoLopes45/polybot-ts/blob/main/SECURITY.md">Security</a>',
			copyright: "Copyright © 2024-present Hugo Lopes",
		},
		search: {
			provider: "local",
		},
	},
	markdown: {
		lineNumbers: true,
	},
});
