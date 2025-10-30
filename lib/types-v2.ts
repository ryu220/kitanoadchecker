/**
 * Advanced Type Definitions for Ad Legal Checker V2
 *
 * These types support the enhanced Gemini API integration with:
 * - Structured text analysis
 * - Segment-based evaluation
 * - Multi-level violation tracking
 * - Knowledge reference mapping
 */

import { ProductId, UserInput } from './types';

/**
 * Text structure analysis result
 * Used by analyzeStructure() to understand the overall composition
 */
export interface TextStructure {
  /** High-level overview of the advertisement */
  overview: string;
  /** Main claims or primary selling points */
  mainClaims: string[];
  /** Supporting statements or secondary information */
  supportingStatements: string[];
  /** Detected call-to-action phrases */
  callToActions?: string[];
  /** Overall tone assessment */
  tone?: 'persuasive' | 'informational' | 'promotional' | 'mixed';
}

/**
 * Segment type classification
 */
export type SegmentType = 'claim' | 'explanation' | 'evidence' | 'cta' | 'disclaimer';

/**
 * Position information for a segment within the original text
 */
export interface SegmentPosition {
  /** Starting character index (0-based) */
  start: number;
  /** Ending character index (exclusive) */
  end: number;
  /** Line number in original text (1-based) */
  line?: number;
}

/**
 * Enhanced segment with type classification and position
 */
export interface Segment {
  /** Unique segment identifier (UUID format) */
  id: string;
  /** Original text content (unchanged from source) */
  text: string;
  /** Classification of segment purpose */
  type: SegmentType;
  /** Position in original text */
  position: SegmentPosition;
  /** Importance score (0-1) for prioritization */
  importance?: number;
  /** Related segment IDs (for contextual analysis) */
  relatedSegments?: string[];
}

/**
 * Violation type classification
 *
 * Priority order (highest to lowest):
 * 1. 社内基準違反 (Company internal standards violation)
 * 2. 薬機法違反 (Pharmaceutical Affairs Law violation)
 * 3. 景表法違反 (Act against Unjustifiable Premiums and Misleading Representations violation)
 * 4. 特商法違反 (Specified Commercial Transactions Law violation)
 * 5. その他 (Other)
 */
export type ViolationType = '社内基準違反' | '薬機法違反' | '景表法違反' | '特商法違反' | 'その他';

/**
 * Violation severity level
 */
export type ViolationSeverity = 'critical' | 'high' | 'medium' | 'low';

/**
 * Reference to knowledge base entry
 */
export interface KnowledgeReference {
  /** Knowledge file identifier */
  file: string;
  /** Relevant excerpt from the knowledge base (null if not found) */
  excerpt: string | null;
  /** Section or article number if applicable */
  section?: string;
  /** Direct URL to full regulation (if available) */
  url?: string;
}

/**
 * Violation detected in a segment
 */
export interface Violation {
  /** Type of violation */
  type: ViolationType;
  /** Severity level */
  severity: ViolationSeverity;
  /** Detailed description of the violation */
  description: string;
  /** Reference to supporting knowledge */
  referenceKnowledge: KnowledgeReference;
  /** Suggested correction or alternative phrasing */
  correctionSuggestion: string;
  /** Confidence score for this violation (0-1) */
  confidence?: number;
  /** Additional context or notes */
  notes?: string;
}

/**
 * Evaluation result for a single segment
 */
export interface SegmentEvaluation {
  /** ID of the evaluated segment */
  segmentId: string;
  /** Overall compliance status */
  compliance: boolean;
  /** List of violations found (empty if compliant) */
  violations: Violation[];
  /** Supporting evidence found (if any) */
  supportingEvidence?: string[];
  /** Evaluation timestamp */
  evaluatedAt: string;
  /** Processing time in milliseconds */
  processingTimeMs?: number;
}

/**
 * Complete analysis report
 */
export interface AnalysisReport {
  /** Report ID */
  id: string;
  /** Input data reference */
  input: UserInput;
  /** Text structure analysis */
  structure: TextStructure;
  /** All segments identified */
  segments: Segment[];
  /** Evaluations for each segment */
  evaluations: SegmentEvaluation[];
  /** Overall compliance summary */
  summary: {
    /** Total segments analyzed */
    totalSegments: number;
    /** Compliant segments count */
    compliantSegments: number;
    /** Total violations found */
    totalViolations: number;
    /** Violations by type */
    violationsByType: Record<ViolationType, number>;
    /** Violations by severity */
    violationsBySeverity: Record<ViolationSeverity, number>;
  };
  /** Final report in markdown format */
  markdown: string;
  /** Generation timestamp */
  generatedAt: string;
  /** Total processing time */
  totalProcessingTimeMs: number;
}

/**
 * Retry configuration for API calls
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxRetries: number;
  /** Initial delay in milliseconds */
  initialDelayMs: number;
  /** Multiplier for exponential backoff */
  backoffMultiplier: number;
  /** Maximum delay between retries */
  maxDelayMs: number;
}

/**
 * Gemini API client configuration
 */
export interface GeminiClientConfig {
  /** Google Gemini API key */
  apiKey: string;
  /** Model name (default: gemini-2.5-flash-lite) */
  model?: string;
  /** Request timeout in milliseconds */
  timeoutMs?: number;
  /** Retry configuration */
  retryConfig?: RetryConfig;
  /** Enable streaming responses */
  enableStreaming?: boolean;
}

/**
 * API call error with retry information
 */
export interface GeminiAPIError extends Error {
  /** Error code from API */
  code?: string;
  /** HTTP status code */
  statusCode?: number;
  /** Number of retries attempted */
  retryCount?: number;
  /** Is error retryable */
  retryable?: boolean;
}

/**
 * Streaming progress callback data
 */
export interface StreamingProgress {
  /** Current chunk of text received */
  chunk: string;
  /** Total chunks received so far */
  totalChunks: number;
  /** Estimated completion percentage (0-100) */
  progress: number;
}

/**
 * Batch processing options
 */
export interface BatchProcessingOptions {
  /** Number of concurrent requests */
  concurrency?: number;
  /** Delay between batch items in milliseconds */
  delayMs?: number;
  /** Stop on first error */
  stopOnError?: boolean;
}

/**
 * Knowledge mapping entry for product-specific rules
 */
export interface ProductKnowledgeMapping {
  /** Product ID */
  productId: ProductId;
  /** Relevant knowledge files */
  knowledgeFiles: string[];
  /** Product-specific constraints */
  constraints?: {
    /** Prohibited expressions */
    prohibitedExpressions?: string[];
    /** Required disclaimers */
    requiredDisclaimers?: string[];
    /** Special notes */
    notes?: string;
  };
}

/**
 * Export all types for convenience
 */
export type {
  // Re-export from base types
  ProductId,
  UserInput,
};
