import { LegalDocument } from "@/components/common/LegalDocument";
import { TERMS_OF_SERVICE } from "@/constants/legal";

/** Renders the bundled terms of service text, available offline. */
export default function TermsOfServiceScreen(): React.JSX.Element {
  return <LegalDocument text={TERMS_OF_SERVICE} />;
}
