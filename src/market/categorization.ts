export const MarketCategory = {
	Crypto: "crypto",
	Politics: "politics",
	Sports: "sports",
	Economics: "economics",
	Entertainment: "entertainment",
	Science: "science",
	Unknown: "unknown",
} as const;

export type MarketCategory = (typeof MarketCategory)[keyof typeof MarketCategory];

interface CategoryPattern {
	readonly category: MarketCategory;
	readonly regex: RegExp;
}

const CATEGORY_PATTERNS: readonly CategoryPattern[] = [
	{
		category: MarketCategory.Crypto,
		regex:
			/\b(btc|bitcoin|ethereum|eth|solana|sol|dogecoin|doge|ripple|xrp|cardano|ada|polkadot|dot|avalanche|avax|chainlink|link|near|cosmos|atom|polygon|matic|uniswap|uni|litecoin|ltc|monero|xmr|zcash|zec|defi|nft|crypto|blockchain|web3)\b/i,
	},
	{
		category: MarketCategory.Politics,
		regex:
			/\b(election|president|congress|senate|house|parliament|prime minister|minister|vote|voter|ballot|referendum|trump|biden|putin|macron|scholz|sunak|modi|bolsonaro|election cycle|democrat|republican|party|federal|governor|mayor|council|policy|legislation|bill|law|diplomatic|embassy|war|conflict|geopolitical|eu|european union|brexit)\b/i,
	},
	{
		category: MarketCategory.Sports,
		regex:
			/\b(nba|nfl|mlb|nhl|nfl|super bowl|world cup|championship league|premier league|manchester|liverpool|barcelona|real madrid|juventus|psg|olympic|olympics|tennis|golf|soccer|football|basketball|baseball|hockey|boxing|mma|ufc|formula 1|racing|marathon|tour de france|wimbledon|masters|stanley cup|world series)\b/i,
	},
	{
		category: MarketCategory.Economics,
		regex:
			/\b(fed|federal reserve|inflation|recession|gdp|gdp growth|unemployment|interest rate|rates|quantitative easing|taper|treasury|bond|yield|stock market|dow|jones|nasdaq|s&p|500|market crash|bull market|bear market|economy|economic|gdp|trade|deficit|debt|default|credit|fiscal|monetary policy|cpi|pce|consumer price|producer price|jobs|report|nonfarm|payroll|retail sales|housing|real estate|forex|usd|euro|yen|gbp)\b/i,
	},
	{
		category: MarketCategory.Entertainment,
		regex:
			/\b(movie|film|oscar|grammy|emmys|golden globe|netflix|disney|hulu|prime video|apple tv|box office|ticket|boxoffice|celebrity|star|actor|actress|director|producer|music|album|single|tour|concert|festival|award|show|series|tv|television|streaming|spotify|concert|ticketmaster|best picture)\b/i,
	},
	{
		category: MarketCategory.Science,
		regex:
			/\b(ai|artificial intelligence|ml|machine learning|quantum|quantum computing|quantum physics|nasa|spacex|space|astronaut|mars|moon|rocket|launch|mission|climate|climate change|global warming|energy|fusion|nuclear|physics|biology|genetics|gene|dna|crispr|vaccine|covid|pandemic|medical|breakthrough|discovery|invention|research|stem|robot|automation)\b/i,
	},
];

export function categorize(input: string): MarketCategory {
	if (!input.trim()) {
		return MarketCategory.Unknown;
	}

	for (const { category, regex } of CATEGORY_PATTERNS) {
		if (regex.test(input)) {
			return category;
		}
	}

	return MarketCategory.Unknown;
}
