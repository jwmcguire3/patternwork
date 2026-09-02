import type { ReportType } from "../../question-engine/types.ts";

export interface PdfLayoutMetrics {
  readonly pageCount: number;
  readonly renderedLineCount: number;
  readonly bottomMarginPoints: number;
  readonly minimumRemainingPoints: number;
}

export interface VerifiedPdf {
  readonly reportType: ReportType;
  readonly filename: string;
  readonly bytes: Buffer;
  readonly sha256: string;
  readonly sourceMarkdownSha256: string;
  readonly extractedText: string;
  readonly pageCount: number;
  readonly pngPageCount: number;
  readonly layout: PdfLayoutMetrics;
}

export interface PdfExternalVerification {
  readonly extractedText: string;
  readonly pageCount: number;
  readonly pngPages: readonly Buffer[];
}

export interface PdfVerificationBoundary {
  verify(pdf: Buffer): Promise<PdfExternalVerification>;
}
