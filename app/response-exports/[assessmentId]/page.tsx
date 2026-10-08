import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { constantTimeEqual } from "@/lib/server/security";
import { readResponseExportCookie, RESPONSE_EXPORT_COOKIE, responseExportGrantIsCurrent } from "@/lib/server/exports";

export default async function ResponseExportsPage({ params }: { readonly params: Promise<{ assessmentId: string }> }) {
  const { assessmentId } = await params;
  const grant = readResponseExportCookie((await cookies()).get(RESPONSE_EXPORT_COOKIE)?.value);
  if (!grant || !constantTimeEqual(grant.sessionId, assessmentId) || !await responseExportGrantIsCurrent(grant)) notFound();
  const encoded = encodeURIComponent(assessmentId);
  return <main>
    <h1>Your assessment responses</h1>
    <p>These files include your authored selections and private notes from the latest completed assessment snapshot.</p>
    <p><strong>Privacy warning:</strong> downloaded files are sensitive plaintext. Save them only on a device you trust and share them deliberately.</p>
    <ul>
      <li><a href={`/api/response-exports/${encoded}?format=json`}>Download JSON</a></li>
      <li><a href={`/api/response-exports/${encoded}?format=pdf`}>Download PDF</a></li>
    </ul>
  </main>;
}
