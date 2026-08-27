import { LegalDocument } from "@/components/common/LegalDocument";
import { withScreenTitle } from "@/components/common/ScreenTitle";
import { TERMS_OF_SERVICE } from "@/constants/legal";

/** Renders the bundled terms of service text, available offline. */
function TermsOfServiceScreen(): React.JSX.Element {
  return <LegalDocument text={TERMS_OF_SERVICE} />;
}

export default withScreenTitle(TermsOfServiceScreen, "Terms of Service");
