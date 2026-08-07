import { LegalDocument } from "@/components/common/LegalDocument";
import { PRIVACY_POLICY } from "@/constants/legal";

/** Renders the bundled privacy policy text, available offline. */
export default function PrivacyPolicyScreen(): React.JSX.Element {
  return <LegalDocument text={PRIVACY_POLICY} />;
}
