import Link from "next/link";
import { notFound } from "next/navigation";
import { MapEditor } from "@/components/MapEditor";
import { getMapBySlug, hasSupabaseConfig, isEditingDisabledInProduction } from "@/lib/map-store";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export default async function EditMapPage({ params }: PageProps) {
  if (isEditingDisabledInProduction()) {
    notFound();
  }

  const { slug } = await params;
  const map = await getMapBySlug(slug);

  if (!map) {
    notFound();
  }

  return (
    <main className="page-shell editor-page">
      <header className="top-bar">
        <div>
          <p className="eyebrow">Protected edit mode</p>
          <h1>{map.data.profile.title || map.title}</h1>
        </div>
        <Link className="text-link" href={`/m/${map.slug}`}>
          View map
        </Link>
      </header>
      <MapEditor
        initialMap={map}
        slug={map.slug}
        supabaseConfigured={hasSupabaseConfig()}
      />
    </main>
  );
}
