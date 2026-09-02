import { Body, Button, Container, Head, Heading, Html, Preview, Section, Text } from "@react-email/components";

export interface ReportDeliveryEmailProps {
  readonly pass: 1 | 2;
  readonly bundleUrl: string;
  readonly part?: { readonly index: 1 | 2; readonly total: 2 };
}

export default function ReportDeliveryEmail({ pass, bundleUrl, part }: ReportDeliveryEmailProps) {
  const mapping = pass === 1;
  const subject = mapping ? "Your Patternwork Mapping Summary" : "Your Patternwork reports are ready";
  return (
    <Html>
      <Head />
      <Preview>{subject}</Preview>
      <Body style={{ backgroundColor: "#f2f5f3", color: "#25313a", fontFamily: "Arial, sans-serif", margin: 0, padding: "28px 12px" }}>
        <Container style={{ backgroundColor: "#ffffff", border: "1px solid #dfe7e2", borderRadius: 12, margin: "0 auto", maxWidth: 580, padding: "34px" }}>
          <Text style={{ color: "#52716a", fontSize: 12, fontWeight: 700, letterSpacing: 2, margin: 0 }}>PATTERNWORK</Text>
          <Heading style={{ color: "#20313c", fontSize: 25, lineHeight: 1.25 }}>{subject}</Heading>
          {part ? <Text>This is attachment email {part.index} of {part.total}. Both emails include the same secure report link.</Text> : null}
          <Text>{mapping ? "Your validated Mapping Summary is attached." : "Your four validated reports are attached. You can also open the complete bundle securely online."}</Text>
          <Section style={{ margin: "28px 0" }}>
            <Button href={bundleUrl} style={{ backgroundColor: "#315f66", borderRadius: 8, color: "white", display: "inline-block", fontWeight: 700, padding: "13px 20px", textDecoration: "none" }}>Open secure report bundle</Button>
          </Section>
          <Text style={{ color: "#65737b", fontSize: 12, lineHeight: 1.5 }}>This link is single-use. The reports are descriptive and non-diagnostic. If you did not request this assessment, you can ignore this email.</Text>
        </Container>
      </Body>
    </Html>
  );
}
