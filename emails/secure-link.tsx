import { Body, Button, Container, Head, Heading, Html, Preview, Text } from "@react-email/components";

export default function SecureLinkEmail({ url, expiresAt }: { readonly url: string; readonly expiresAt: Date }) {
  const isReport = new URL(url).pathname.startsWith("/reports");
  return (
    <Html>
      <Head />
      <Preview>{isReport ? "Open your Patternwork reports" : "Resume your Patternwork assessment"}</Preview>
      <Body style={{ backgroundColor: "#f2f5f3", color: "#25313a", fontFamily: "Arial, sans-serif", padding: "28px 12px" }}>
        <Container style={{ backgroundColor: "white", border: "1px solid #dfe7e2", borderRadius: 12, margin: "0 auto", maxWidth: 560, padding: 34 }}>
          <Text style={{ color: "#52716a", fontSize: 12, fontWeight: 700, letterSpacing: 2 }}>PATTERNWORK</Text>
          <Heading style={{ fontSize: 24 }}>{isReport ? "Your secure report link" : "Your secure resume link"}</Heading>
          <Text>The button below can be used once and expires {expiresAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })}.</Text>
          <Button href={url} style={{ backgroundColor: "#315f66", borderRadius: 8, color: "white", fontWeight: 700, padding: "13px 20px", textDecoration: "none" }}>{isReport ? "Open reports" : "Resume assessment"}</Button>
          <Text style={{ color: "#65737b", fontSize: 12 }}>If you did not request this link, you can ignore this email.</Text>
        </Container>
      </Body>
    </Html>
  );
}
