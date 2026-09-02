export interface ResumeLinkDelivery {
  deliver(input: { readonly email: string; readonly resumeUrl: string; readonly expiresAt: Date }): Promise<void>;
}

const inertDelivery: ResumeLinkDelivery = {
  async deliver() {
    // The delivery worker replaces this boundary. Persistence remains credential-free.
  },
};

let configuredDelivery: ResumeLinkDelivery = inertDelivery;

export function configureResumeLinkDelivery(delivery: ResumeLinkDelivery): () => void {
  const previous = configuredDelivery;
  configuredDelivery = delivery;
  return () => { configuredDelivery = previous; };
}

export function getResumeLinkDelivery(): ResumeLinkDelivery {
  return configuredDelivery;
}
