export type FeedLayer = "personal" | "discovery" | "editorial";
export type SelectionMode = "topical" | "broad_personal" | "broad_discovery";
export type OriginScope = "any" | "people" | "publishers";

export interface Author {
  id?: string;
  name: string;
  handle?: string;
  avatar?: string | null;
}

export interface Engagement {
  likes?: number;
  replies?: number;
  reposts?: number;
}

export interface Candidate {
  id: string;
  sourceType: string;
  sourceName: string;
  canonicalUrl?: string | null;
  author: Author;
  text: string;
  title?: string;
  language?: string | null;
  publishedAt: string;
  indexedAt?: string;
  engagement?: Engagement;
  feedLayer?: FeedLayer;
  retrievalContext?: string;
  socialContext?: string | null;
  tags?: string[];
  labels?: string[];
  media?: unknown[];
  [key: string]: unknown;
}

export interface RankingWeights {
  relevance: number;
  tone: number;
  freshness: number;
  social: number;
  engagement: number;
}

export interface RankingProgram {
  intent?: string;
  selection_mode?: SelectionMode;
  origin_scope?: OriginScope;
  include?: string[];
  exclude?: string[];
  tone?: string[];
  social_scope?: string[];
  content_forms?: string[];
  languages?: string[];
  required_sources?: string[];
  weights?: Partial<RankingWeights>;
  diversity?: { max_per_author?: number };
  horizon_hours?: number;
  familiarity_target?: number;
  market_context?: string;
  discovery?: {
    bluesky_queries?: string[];
    reddit_queries?: string[];
    mastodon_tags?: string[];
  };
}

export interface EvaluationSignal {
  id: string;
  semantic_score: number;
  tone_score: number;
  core_match: boolean;
  hard_excluded: boolean;
  reasons: string[];
}

export interface RankedCandidate {
  id: string;
  score: number;
  reasons: string[];
  components: Record<string, number>;
}

export type ConnectorCapability = "personal-feed" | "discovery" | "publishing";

export interface ConnectorContext {
  intent: string;
  program: RankingProgram;
  profileContext?: string;
  limit?: number;
}

export interface ConnectorManifest {
  apiVersion: 1;
  id: string;
  name: string;
  capabilities: ConnectorCapability[];
  fetchCandidates(context: ConnectorContext): Promise<Candidate[]>;
}
