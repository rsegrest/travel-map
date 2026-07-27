import Link from "next/link";
import { notFound } from "next/navigation";
import { TravelMap } from "@/components/TravelMap";
import { getMapBySlug } from "@/lib/map-store";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export default async function PublicMapPage({ params }: PageProps) {
  const { slug } = await params;
  const map = await getMapBySlug(slug);

  if (!map) {
    notFound();
  }

  return (
    <main className="page-shell">
      <header className="top-bar">
        <div>
          <p className="eyebrow">Travel map</p>
          <h1>{map.data.profile.title || map.title}</h1>
        </div>
        <Link className="text-link" href={`/m/${map.slug}/admin`} style={{ fontSize: 12, opacity: 0.5 }}>
          Admin
        </Link>
      </header>
      <TravelMap map={map} />
    </main>
  );
}
