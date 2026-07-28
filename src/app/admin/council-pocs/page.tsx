import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { redirect } from "next/navigation";
import CouncilPocManager from "@/components/admin/CouncilPocManager";
import FilterRail, { type Facet } from "@/components/ui/FilterRail";
import { municipalityLabel } from "@/lib/utils";
import { isStaffRole, type CouncilPoc } from "@/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Council POCs — ConveyClear Admin" };

// B5 / Theme G — internal directory of council points-of-contact (staff only).
export default async function AdminCouncilPocsPage() {
  const session = await getSessionProfile();
  if (!session || !isStaffRole(session.profile?.role)) redirect("/auth/login");

  const supabase = await createClient();
  const { data } = await supabase
    .from("council_pocs")
    .select("*")
    .order("council", { ascending: true })
    .order("first_name", { ascending: true });

  const pocs = (data as CouncilPoc[] | null) ?? [];

  // Facets are built from the values actually present in the directory rather
  // than a fixed list — a POC's region/department are free text typed by staff,
  // so the only honest option list is the one the data already contains. A facet
  // with nothing in it is dropped instead of rendering an empty heading.
  const distinct = (pick: (p: CouncilPoc) => string | null) =>
    Array.from(new Set(pocs.map(pick).filter((v): v is string => Boolean(v && v.trim())))).sort();

  const councils = distinct((p) => p.council);
  const regions = distinct((p) => p.region);
  const departments = distinct((p) => p.department);

  const facets: Facet[] = [
    ...(councils.length
      ? [
          {
            key: "council",
            label: "Council",
            defaultValue: "",
            options: [
              { value: "", label: "Any council" },
              ...councils.map((c) => ({ value: c, label: municipalityLabel(c) })),
            ],
          } as Facet,
        ]
      : []),
    ...(regions.length
      ? [
          {
            key: "region",
            label: "Region / branch",
            defaultValue: "",
            options: [{ value: "", label: "Any region" }, ...regions.map((r) => ({ value: r, label: r }))],
          } as Facet,
        ]
      : []),
    ...(departments.length
      ? [
          {
            key: "department",
            label: "Department",
            defaultValue: "",
            options: [
              { value: "", label: "Any department" },
              ...departments.map((d) => ({ value: d, label: d })),
            ],
          } as Facet,
        ]
      : []),
  ];

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Council POCs</h1>
        <p className="text-sm text-gray-500 mt-1">
          {pocs.length} council contact{pocs.length === 1 ? "" : "s"} · internal directory — not visible to partners or clients
        </p>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        <FilterRail facets={facets} searchPlaceholder="Search name, council, dept…" />
        <div className="min-w-0 flex-1">
          <CouncilPocManager initialPocs={pocs} />
        </div>
      </div>
    </div>
  );
}
