import { PrismaNotificationDelivery, notificationIdempotencyKey } from "../notifications/index.ts";

export interface ResponseExportLinkDeliveryInput {
  readonly assessmentSessionId: string;
  readonly idempotencySubject: string;
  readonly email: string;
  readonly exportUrl: string;
  readonly expiresAt: Date;
}

export interface ResponseExportLinkDelivery {
  deliver(input: ResponseExportLinkDeliveryInput): Promise<void>;
}

export class NotificationResponseExportLinkDelivery implements ResponseExportLinkDelivery {
  constructor(private readonly notifications = new PrismaNotificationDelivery()) {}

  async deliver(input: ResponseExportLinkDeliveryInput): Promise<void> {
    const created = await this.notifications.create({
      assessmentSessionId: input.assessmentSessionId,
      type: "EXPORT_LINK",
      idempotencyKey: notificationIdempotencyKey({ type: "EXPORT_LINK", subjectId: input.idempotencySubject }),
      email: input.email,
      actionUrl: input.exportUrl,
    });
    await this.notifications.dispatch(created.id);
  }
}

export function getResponseExportLinkDelivery(): ResponseExportLinkDelivery {
  return new NotificationResponseExportLinkDelivery();
}
