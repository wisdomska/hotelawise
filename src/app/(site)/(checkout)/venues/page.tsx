// /venues is now a section of /rent (DECISIONS D-53). Old links and bookmarks land there.
import { permanentRedirect } from 'next/navigation';

export default function VenuesPage() {
  permanentRedirect('/rent#venues');
}
