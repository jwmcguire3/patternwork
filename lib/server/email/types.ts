export interface EmailAttachment {
  readonly filename: string;
  readonly content: Buffer;
  readonly contentType: "application/pdf";
}

export interface OutboundEmail {
  readonly from: string;
  readonly to: string;
  readonly bcc?: string;
  readonly subject: string;
  readonly html: string;
  readonly attachments?: readonly EmailAttachment[];
}

export interface EmailTransport {
  send(message: OutboundEmail, idempotencyKey: string): Promise<{ readonly id: string }>;
}

export interface ReportDeliveryBoundary {
  deliverReleased(input: { readonly assessmentSessionId: string; readonly completedPass: 1 | 2; readonly invocationKey: string }): Promise<void>;
}
