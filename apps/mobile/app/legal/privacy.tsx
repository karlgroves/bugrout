import { LegalDocument } from "@/components/common/LegalDocument";
import { withScreenTitle } from "@/components/common/ScreenTitle";
import { PRIVACY_POLICY } from "@/constants/legal";

/** Renders the bundled privacy policy text, available offline. */
function PrivacyPolicyScreen(): React.JSX.Element {
  return <LegalDocument text={PRIVACY_POLICY} />;
}

export default withScreenTitle(PrivacyPolicyScreen, "Privacy Policy");
