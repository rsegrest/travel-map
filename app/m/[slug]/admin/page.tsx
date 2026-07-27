import { notFound } from "next/navigation";
import { isEditingDisabledInProduction } from "@/lib/map-store";
import AdminClient from "./AdminClient";

export default function AdminPage() {
  if (isEditingDisabledInProduction()) {
    notFound();
  }

  return <AdminClient />;
}
